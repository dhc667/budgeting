import type { RowOf, Rows } from "../sync/copy";
import { isPrivate } from "./space";
import type { Activity, Space } from "./space-queries";

export function readSpaces({ spaces, space_members }: Pick<Rows, "spaces" | "space_members">) {
  const members = [...space_members.values()];
  return [...spaces.values()]
    .map(({ id, name, private_owner }) => ({
      id,
      name,
      private_owner,
      members: members
        .filter(({ space_id }) => space_id === id)
        .map((member) => ({ id: member.id, user_id: member.user_id })),
    }))
    .sort(privateFirstThenByName);
}

export function readSpaceActivity({ activity }: Pick<Rows, "activity">, spaceId: string) {
  return newestFirst(activity, ({ space_id }) => space_id === spaceId);
}

export function newestFirst(
  activity: Rows["activity"],
  keep: (entry: RowOf<"activity">) => boolean,
): Activity[] {
  return [...activity.values()]
    .filter(keep)
    .sort((a, b) => b.id - a.id)
    .map(
      ({
        id,
        table_name,
        row_id,
        action,
        changed_by,
        changed_at,
        old,
        new: updated,
      }): Activity => ({
        id,
        table_name,
        row_id,
        action,
        changed_by,
        changed_at,
        old,
        new: updated,
      }),
    );
}

function privateFirstThenByName(a: Space, b: Space): number {
  if (isPrivate(a)) return -1;
  if (isPrivate(b)) return 1;
  return (a.name ?? "").localeCompare(b.name ?? "");
}
