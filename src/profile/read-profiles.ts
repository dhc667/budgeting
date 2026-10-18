import { keyOfId, type Rows } from "../sync/copy";
import type { Profile, User } from "./profile-queries";

export function readProfile({ profiles }: Pick<Rows, "profiles">, userId: string): Profile | null {
  return profiles.get(keyOfId(userId)) ?? null;
}

export function readUsers({ profiles }: Pick<Rows, "profiles">): User[] {
  return [...profiles.values()]
    .map(({ id, display_name }) => ({ id, display_name }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}
