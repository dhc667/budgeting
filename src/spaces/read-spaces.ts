import { type Activity, newestFirst } from "../activity/activity";
import type { Rows } from "../sync/copy";
import { isNonEmpty, type NonEmpty } from "../non-empty";
import { isPrivate } from "./space";
import type { Space } from "./space-queries";

export function readSpaces({
  spaces,
  space_members,
}: Pick<Rows, "spaces" | "space_members">): NonEmpty<Space> | undefined {
  const members = [...space_members.values()];
  const read = [...spaces.values()]
    .map(({ id, name, private_owner }) => ({
      id,
      name,
      private_owner,
      members: members
        .filter(({ space_id }) => space_id === id)
        .map((member) => ({ id: member.id, user_id: member.user_id })),
    }))
    .sort(privateFirstThenByName);
  // Every user has their private space from signing up, and can't leave it. Only a user who has
  // just been deleted has none, and has nothing to see until they're signed out.
  return isNonEmpty(read) ? read : undefined;
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
