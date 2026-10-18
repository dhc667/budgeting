import type { RowOf, Rows } from "../sync/copy";

export type Activity = Omit<RowOf<"activity">, "space_id" | "version">;

export function newestFirst(
  activity: Rows["activity"],
  keep: (entry: RowOf<"activity">) => boolean,
): Activity[] {
  return [...activity.values()]
    .filter(keep)
    .sort((a, b) => b.id - a.id)
    .map(({ space_id, version, ...entry }) => entry);
}
