import type { RowOf, Rows } from "../sync/copy";

export type Activity = Omit<RowOf<"activity">, "space_id" | "version">;

export function newestFirst(
  activity: Rows["activity"],
  keep: (entry: RowOf<"activity">) => boolean,
): Activity[] {
  return newestEntriesFirst([...activity.values()].filter(keep));
}

export function newestEntriesFirst(entries: RowOf<"activity">[]): Activity[] {
  return entries.sort((a, b) => b.id - a.id).map(({ space_id, version, ...entry }) => entry);
}
