import { type DBSchema, deleteDB, type IDBPDatabase, openDB } from "idb";
import {
  buildCopy,
  type Delta,
  type LocalCopy,
  type Row,
  type SyncedTable,
  syncedTables,
} from "./copy";

export type CopyStore = {
  load: (schemaVersion: number) => Promise<LocalCopy | null>;
  // Rows, deletions and the version reached go in one transaction, so a crash can't leave a
  // version ahead of its rows.
  save: (copy: LocalCopy, delta: Delta) => Promise<void>;
  clear: () => Promise<void>;
  close: () => void;
};

export async function openCopyStore(name: string): Promise<CopyStore> {
  const db = await openDB<CopySchema>(name, 1, {
    upgrade(upgrading) {
      for (const table of syncedTables) upgrading.createObjectStore(table);
      upgrading.createObjectStore(metaStore);
    },
    // Deleting the copy (signing out) must not wait for this connection.
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

const metaStore = "meta";
const metaKey = "state";

type Meta = Pick<LocalCopy, "version" | "spaceIds" | "schemaVersion">;

type CopySchema = DBSchema & { [Table in SyncedTable]: { key: string; value: Row } } & {
  [metaStore]: { key: string; value: Meta };
};

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

  const rows = new Map<SyncedTable, Map<string, Row>>();
  for (const table of syncedTables) {
    const stored = new Map<string, Row>();
    for await (const cursor of tx.objectStore(table)) stored.set(cursor.key, cursor.value);
    rows.set(table, stored);
  }
  return buildCopy(meta, (table) => rows.get(table) ?? new Map());
}

async function save(db: IDBPDatabase<CopySchema>, copy: LocalCopy, delta: Delta) {
  const tx = db.transaction([...syncedTables, metaStore], "readwrite");
  const { version, spaceIds, schemaVersion } = copy;
  await Promise.all([
    ...(delta.startedOver ? syncedTables.map((table) => tx.objectStore(table).clear()) : []),
    ...delta.removed.map(({ table, key }) => tx.objectStore(table).delete(key)),
    ...delta.written.map(({ table, key, row }) => tx.objectStore(table).put(row, key)),
    tx.objectStore(metaStore).put({ version, spaceIds, schemaVersion }, metaKey),
    tx.done,
  ]);
}

async function clear(db: IDBPDatabase<CopySchema>) {
  const tx = db.transaction([...syncedTables, metaStore], "readwrite");
  await Promise.all([
    ...syncedTables.map((table) => tx.objectStore(table).clear()),
    tx.objectStore(metaStore).clear(),
    tx.done,
  ]);
}
