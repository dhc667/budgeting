import type { RowOf, Rows } from "../sync/copy";

export type Activity = Omit<RowOf<"activity">, "space_id" | "version">;

export function newestFirst(
  activity: Rows["activity"],
  keep: (entry: RowOf<"activity">) => boolean,
): Activity[] {
  return newestEntriesFirst([...activity.values()].filter(keep));
}

export function historyOf(
  activity: Rows["activity"],
  table: RowOf<"activity">["table_name"],
  rowId: string,
): Activity[] {
  return newestFirst(
    activity,
    ({ table_name, row_id }) => table_name === table && row_id === rowId,
  );
}

export function newestEntriesFirst(entries: RowOf<"activity">[]): Activity[] {
  return entries.sort((a, b) => b.id - a.id).map(({ space_id, version, ...entry }) => entry);
}
