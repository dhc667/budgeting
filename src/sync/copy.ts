import type { Database } from "../supabase/database";

export type Changes = Database["public"]["Functions"]["changes_since"]["Returns"];

export type SyncedTable = keyof Changes["rows"];

export type Row = Changes["rows"][SyncedTable][number];

// The rows the user can see, per table, by the string `rowKey` makes of their key.
export type LocalCopy = {
  version: number;
  spaceIds: readonly string[];
  schemaVersion: number;
  rows: Readonly<Record<SyncedTable, ReadonlyMap<string, Row>>>;
};

// What applying a pull changed, so a store can save exactly that.
export type Delta = {
  startedOver: boolean;
  removed: { table: SyncedTable; key: string }[];
  written: { table: SyncedTable; key: string; row: Row }[];
};

export type Applied =
  { outcome: "repull" } | { outcome: "applied"; copy: LocalCopy; delta: Delta; changed: boolean };

// Deletions first, then rows: a restored transaction keeps its id and is in both, and `rows` is
// what exists at the pull's snapshot.
//
// A pull that arrives for a copy built for other spaces can't be applied, since joining or leaving
// a space changes what is visible without writing rows: the caller drops the copy and pulls from 0.
export function applyPull(copy: LocalCopy | null, pull: Changes, schemaVersion: number): Applied {
  if (copy && !pull.reset && !sameSet(copy.spaceIds, pull.space_ids)) {
    return { outcome: "repull" };
  }

  const kept = copy && !pull.reset ? copy : null;
  const startedOver = kept === null;
  const tables = new Tables(kept ? kept.rows : mapTables(() => new Map()));

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
    changed: startedOver || delta.removed.length > 0 || delta.written.length > 0,
  };
}

export function buildCopy(
  { version, spaceIds, schemaVersion }: Pick<LocalCopy, "version" | "spaceIds" | "schemaVersion">,
  rowsOf: (table: SyncedTable) => ReadonlyMap<string, Row>,
): LocalCopy {
  return { version, spaceIds, schemaVersion, rows: mapTables(rowsOf) };
}

function rowKey(table: SyncedTable, row: Row): string {
  return keyString(table, (column) => Reflect.get(row, column));
}

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

function isSyncedTable(name: string): name is SyncedTable {
  return name in keyColumns;
}

function keyOfDeletion(table: SyncedTable, key: Record<string, string>): string {
  return keyString(table, (column) => key[column]);
}

function keyString(table: SyncedTable, valueOf: (column: string) => unknown): string {
  return JSON.stringify(keyColumns[table].map(valueOf));
}

function mapTables(rowsOf: (table: SyncedTable) => ReadonlyMap<string, Row>): LocalCopy["rows"] {
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

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

// Copies a table the first time it is touched, so the copy being replaced is never mutated and an
// untouched table is shared between the old copy and the new.
class Tables {
  removed: Delta["removed"] = [];
  written: Delta["written"] = [];
  private readonly touched = new Map<SyncedTable, Map<string, Row>>();

  private readonly base: LocalCopy["rows"];

  constructor(base: LocalCopy["rows"]) {
    this.base = base;
  }

  remove(table: SyncedTable, key: string) {
    if (!this.base[table].has(key) && !this.touched.get(table)?.has(key)) return;
    this.editable(table).delete(key);
    this.written = this.written.filter((w) => w.table !== table || w.key !== key);
    this.removed.push({ table, key });
  }

  write(table: SyncedTable, key: string, row: Row) {
    const current = this.touched.get(table)?.get(key) ?? this.base[table].get(key);
    if (current && JSON.stringify(current) === JSON.stringify(row)) return;
    this.editable(table).set(key, row);
    this.written.push({ table, key, row });
  }

  // A posting going away can leave a transaction the user can no longer see, which the server
  // has no deletion to report.
  dropTransactionsWithoutPostings() {
    const withPostings = new Set<unknown>();
    for (const posting of this.current("postings").values()) {
      withPostings.add(Reflect.get(posting, "transaction_id"));
    }
    for (const [key, transaction] of this.current("transactions")) {
      if (!withPostings.has(Reflect.get(transaction, "id"))) this.remove("transactions", key);
    }
  }

  rows(): LocalCopy["rows"] {
    return mapTables((table) => this.current(table));
  }

  private current(table: SyncedTable): ReadonlyMap<string, Row> {
    return this.touched.get(table) ?? this.base[table];
  }

  private editable(table: SyncedTable): Map<string, Row> {
    let rows = this.touched.get(table);
    if (!rows) {
      rows = new Map(this.base[table]);
      this.touched.set(table, rows);
    }
    return rows;
  }
}
