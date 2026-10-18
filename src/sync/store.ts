import { type DBSchema, deleteDB, type IDBPDatabase, openDB } from "idb";
import {
  type Delta,
  type LocalCopy,
  type Meta,
  type RowOf,
  type SyncedTable,
  syncedTables,
} from "./copy";

export async function openCopyStore(name: string): Promise<CopyStore> {
  const db = await openDB<CopySchema>(name, 1, {
    upgrade(upgrading) {
      for (const table of syncedTables) upgrading.createObjectStore(table);
      upgrading.createObjectStore(metaStore);
    },
    // Deleting the database (signing out) waits for open connections, so this one must give way.
    blocking() {
      db.close();
    },
  });

  return {
    load: (schemaVersion) => load(db, schemaVersion),
    save: (copy, delta) => save(db, copy, delta),
    clear: () => clear(db),
    close: () => db.close(),
  };
}

export function deleteCopy(name: string): Promise<void> {
  return deleteDB(name);
}

async function load(
  db: IDBPDatabase<CopySchema>,
  schemaVersion: number,
): Promise<LocalCopy | null> {
  const tx = db.transaction([...syncedTables, metaStore], "readonly");
  const meta = await tx.objectStore(metaStore).get(metaKey);
  if (!meta) return null;
  if (meta.schemaVersion !== schemaVersion) {
    await clear(db);
    return null;
  }

  return {
    ...meta,
    rows: {
      currencies: await readAll(tx.objectStore("currencies")),
      exchange_rates: await readAll(tx.objectStore("exchange_rates")),
      exchange_rate_history_starts: await readAll(tx.objectStore("exchange_rate_history_starts")),
      profiles: await readAll(tx.objectStore("profiles")),
      spaces: await readAll(tx.objectStore("spaces")),
      space_members: await readAll(tx.objectStore("space_members")),
      activity: await readAll(tx.objectStore("activity")),
      ledger_accounts: await readAll(tx.objectStore("ledger_accounts")),
      transactions: await readAll(tx.objectStore("transactions")),
      postings: await readAll(tx.objectStore("postings")),
      recurring_transactions: await readAll(tx.objectStore("recurring_transactions")),
      budgets: await readAll(tx.objectStore("budgets")),
      budget_exclusions: await readAll(tx.objectStore("budget_exclusions")),
    },
  };
}

// One request for the keys and one for the rows, which come in the same key order. A cursor
// would take a round trip per row.
async function readAll<Row>(store: {
  getAllKeys: () => Promise<string[]>;
  getAll: () => Promise<Row[]>;
}): Promise<Map<string, Row>> {
  const [keys, rows] = await Promise.all([store.getAllKeys(), store.getAll()]);
  return new Map(
    keys.flatMap((key, index) => {
      const row = rows[index];
      return row === undefined ? [] : [[key, row] as const];
    }),
  );
}

async function save(db: IDBPDatabase<CopySchema>, copy: LocalCopy, delta: Delta) {
  const tx = db.transaction([...syncedTables, metaStore], "readwrite");
  const { version, spaceIds, rateCurrencies, schemaVersion } = copy;
  await Promise.all([
    ...(delta.startedOver ? syncedTables.map((table) => tx.objectStore(table).clear()) : []),
    ...delta.removed.map(({ table, key }) => tx.objectStore(table).delete(key)),
    putAll(tx.objectStore("currencies"), delta.written.currencies),
    putAll(tx.objectStore("exchange_rates"), delta.written.exchange_rates),
    putAll(
      tx.objectStore("exchange_rate_history_starts"),
      delta.written.exchange_rate_history_starts,
    ),
    putAll(tx.objectStore("profiles"), delta.written.profiles),
    putAll(tx.objectStore("spaces"), delta.written.spaces),
    putAll(tx.objectStore("space_members"), delta.written.space_members),
    putAll(tx.objectStore("activity"), delta.written.activity),
    putAll(tx.objectStore("ledger_accounts"), delta.written.ledger_accounts),
    putAll(tx.objectStore("transactions"), delta.written.transactions),
    putAll(tx.objectStore("postings"), delta.written.postings),
    putAll(tx.objectStore("recurring_transactions"), delta.written.recurring_transactions),
    putAll(tx.objectStore("budgets"), delta.written.budgets),
    putAll(tx.objectStore("budget_exclusions"), delta.written.budget_exclusions),
    tx.objectStore(metaStore).put({ version, spaceIds, rateCurrencies, schemaVersion }, metaKey),
    tx.done,
  ]);
}

function putAll<Row>(
  store: { put: (row: Row, key: string) => Promise<unknown> },
  rows: ReadonlyMap<string, Row> | undefined,
): Promise<unknown> {
  return Promise.all([...(rows ?? [])].map(([key, row]) => store.put(row, key)));
}

async function clear(db: IDBPDatabase<CopySchema>) {
  const tx = db.transaction([...syncedTables, metaStore], "readwrite");
  await Promise.all([
    ...syncedTables.map((table) => tx.objectStore(table).clear()),
    tx.objectStore(metaStore).clear(),
    tx.done,
  ]);
}

export type CopyStore = {
  load: (schemaVersion: number) => Promise<LocalCopy | null>;
  // Rows, deletions and the version reached go in one transaction, so a crash can't leave a
  // version ahead of its rows.
  save: (copy: LocalCopy, delta: Delta) => Promise<void>;
  clear: () => Promise<void>;
  close: () => void;
};

const metaStore = "meta";
const metaKey = "state";

type CopySchema = DBSchema & { [Table in SyncedTable]: { key: string; value: RowOf<Table> } } & {
  [metaStore]: { key: string; value: Meta };
};
