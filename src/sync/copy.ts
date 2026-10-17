import type { Database } from "../supabase/database";

export function applyPull(copy: LocalCopy | null, pull: Changes, schemaVersion: number): Applied {
  // Joining or leaving a space changes what is visible without writing rows, so the copy can't be
  // brought up to date by this pull: the caller drops it and pulls from 0.
  if (copy && !pull.reset && !sameSet(copy.spaceIds, pull.space_ids)) {
    return { outcome: "repull" };
  }

  const kept = copy && !pull.reset ? copy : null;
  const startedOver = kept === null;
  const tables = new Tables(kept ? kept.rows : mapTables(() => new Map()));

  // Deletions first: a restored transaction keeps its id and is in both, and `rows` is what exists
  // at the pull's snapshot.
  for (const { table, key } of pull.deleted) tables.remove(table, keyOfDeletion(table, key));
  for (const table of syncedTables) {
    for (const row of pull.rows[table]) tables.write(table, rowKey(table, row), row);
  }
  tables.dropTransactionsWithoutPostings();

  const delta: Delta = { startedOver, removed: tables.removed, written: tables.written };
  return {
    outcome: "applied",
    copy: {
      version: pull.version,
      spaceIds: pull.space_ids,
      schemaVersion,
      rows: tables.rows(),
    },
    delta,
    changed: startedOver || delta.removed.length > 0 || tables.hasWrites(),
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function rowKey(table: SyncedTable, row: Row): string {
  return keyString(table, (column) => Reflect.get(row, column));
}

function keyOfDeletion(table: SyncedTable, key: Record<string, string>): string {
  return keyString(table, (column) => key[column]);
}

function keyString(table: SyncedTable, valueOf: (column: string) => unknown): string {
  return JSON.stringify(keyColumns[table].map(valueOf));
}

function isSyncedTable(name: string): name is SyncedTable {
  return name in keyColumns;
}

function mapTables(rowsOf: RowsOf): Rows {
  return {
    currencies: rowsOf("currencies"),
    exchange_rates: rowsOf("exchange_rates"),
    exchange_rate_history_starts: rowsOf("exchange_rate_history_starts"),
    profiles: rowsOf("profiles"),
    spaces: rowsOf("spaces"),
    space_members: rowsOf("space_members"),
    activity: rowsOf("activity"),
    ledger_accounts: rowsOf("ledger_accounts"),
    transactions: rowsOf("transactions"),
    postings: rowsOf("postings"),
    recurring_transactions: rowsOf("recurring_transactions"),
    budgets: rowsOf("budgets"),
    budget_exclusions: rowsOf("budget_exclusions"),
  };
}

// Copies a table the first time it is touched, so the copy being replaced is never mutated and an
// untouched table is shared between the old copy and the new.
class Tables {
  removed: Delta["removed"] = [];
  written: { [T in SyncedTable]?: Map<string, RowOf<T>> } = {};
  private readonly maybeOrphaned = new Set<string>();
  private edited: { [T in SyncedTable]?: Map<string, RowOf<T>> } = {};

  private readonly base: Rows;

  constructor(base: Rows) {
    this.base = base;
  }

  remove<T extends SyncedTable>(table: T, key: string) {
    const gone = this.current(table).get(key);
    if (!gone) return;
    this.editable(table).delete(key);
    this.written[table]?.delete(key);
    this.removed.push({ table, key });
    this.noteTransactionsOf(table, gone);
  }

  write<T extends SyncedTable>(table: T, key: string, row: RowOf<T>) {
    const current = this.current(table).get(key);
    if (current && JSON.stringify(current) === JSON.stringify(row)) return;
    this.editable(table).set(key, row);
    const written = this.written[table] ?? new Map<string, RowOf<T>>();
    this.written = { ...this.written, [table]: written.set(key, row) };
    if (current) this.noteTransactionsOf(table, current);
    this.noteTransactionsOf(table, row);
  }

  // A posting going away can leave a transaction the user can no longer see, which the server
  // has no deletion to report. Only transactions touched by this pull can have lost theirs.
  dropTransactionsWithoutPostings() {
    const unmatched = new Set(this.maybeOrphaned);
    for (const posting of this.current("postings").values()) {
      if (unmatched.size === 0) break;
      unmatched.delete(posting.transaction_id);
    }
    for (const id of unmatched) this.remove("transactions", JSON.stringify([id]));
  }

  hasWrites(): boolean {
    return Object.values(this.written).some((rows) => rows.size > 0);
  }

  rows(): Rows {
    return mapTables((table) => this.current(table));
  }

  private noteTransactionsOf(table: SyncedTable, row: Row) {
    if (table === "postings" && "transaction_id" in row) this.maybeOrphaned.add(row.transaction_id);
    if (table === "transactions" && "id" in row && typeof row.id === "string") {
      this.maybeOrphaned.add(row.id);
    }
  }

  private current<T extends SyncedTable>(table: T): ReadonlyMap<string, RowOf<T>> {
    return this.edited[table] ?? this.base[table];
  }

  private editable<T extends SyncedTable>(table: T): Map<string, RowOf<T>> {
    const rows = this.edited[table] ?? new Map(this.base[table]);
    this.edited = { ...this.edited, [table]: rows };
    return rows;
  }
}

export type Changes = Database["public"]["Functions"]["changes_since"]["Returns"];

export type SyncedTable = keyof Changes["rows"];

export type RowOf<T extends SyncedTable> = Changes["rows"][T][number];

type Row = RowOf<SyncedTable>;

type Rows = { [T in SyncedTable]: ReadonlyMap<string, RowOf<T>> };

export type Meta = {
  version: number;
  spaceIds: readonly string[];
  schemaVersion: number;
};

export type LocalCopy = Meta & { rows: Rows };

// What applying a pull changed, so a store can save exactly that.
export type Delta = {
  startedOver: boolean;
  removed: { table: SyncedTable; key: string }[];
  written: { [T in SyncedTable]?: ReadonlyMap<string, RowOf<T>> };
};

export type Applied =
  { outcome: "repull" } | { outcome: "applied"; copy: LocalCopy; delta: Delta; changed: boolean };

type RowsOf = <T extends SyncedTable>(table: T) => ReadonlyMap<string, RowOf<T>>;

// The columns the server keys each table by.
const keyColumns: Record<SyncedTable, readonly string[]> = {
  currencies: ["code"],
  exchange_rates: ["date", "currency"],
  exchange_rate_history_starts: ["provider", "currency"],
  profiles: ["id"],
  spaces: ["id"],
  space_members: ["id"],
  activity: ["id"],
  ledger_accounts: ["id"],
  transactions: ["id"],
  postings: ["id"],
  recurring_transactions: ["id"],
  budgets: ["id"],
  budget_exclusions: ["budget_id", "transaction_id"],
};

export const syncedTables = Object.keys(keyColumns).filter(isSyncedTable);
