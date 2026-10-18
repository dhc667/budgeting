import { useSignedInUser } from "../auth/session";
import { useSupabase } from "../instance/instance-context";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import type { Tables, TablesUpdate } from "../supabase/database.types";

// Null once a pulled copy no longer holds the signed-in user's profile: the user was deleted.
export function useProfile() {
  const user = useSignedInUser();
  return useCopyQuery(["profile"], ({ rows }): Profile | null => {
    return [...rows.profiles.values()].find(({ id }) => id === user.id) ?? null;
  });
}

export function useUpdateProfile() {
  const supabase = useSupabase();
  const user = useSignedInUser();
  return useCopyMutation(async (changes: ProfileChanges) => {
    const { error } = await supabase.from("profiles").update(changes).eq("id", user.id);
    if (error) throw error;
  });
}

export function useUsers() {
  return useCopyQuery(["users"], ({ rows }): User[] =>
    [...rows.profiles.values()]
      .map(({ id, display_name }) => ({ id, display_name }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name)),
  );
}

export function displayNameOf(users: User[], userId: string | null): string | undefined {
  return users.find(({ id }) => id === userId)?.display_name;
}

export type Profile = Tables<"profiles">;

export type User = Pick<Profile, "id" | "display_name">;

type ProfileChanges = Omit<TablesUpdate<"profiles">, "id" | "created_at">;
