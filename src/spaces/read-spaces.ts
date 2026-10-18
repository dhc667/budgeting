import { type Activity, newestFirst } from "../activity/activity";
import type { Rows } from "../sync/copy";
import { isPrivate } from "./space";
import type { Space } from "./space-queries";

export function readSpaces({
  spaces,
  space_members,
}: Pick<Rows, "spaces" | "space_members">): Space[] {
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

export function readSpaceActivity(
  { activity }: Pick<Rows, "activity">,
  spaceId: string,
): Activity[] {
  return newestFirst(activity, ({ space_id }) => space_id === spaceId);
}

function privateFirstThenByName(a: Space, b: Space): number {
  if (isPrivate(a)) return -1;
  if (isPrivate(b)) return 1;
  return (a.name ?? "").localeCompare(b.name ?? "");
}
