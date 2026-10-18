import { useSignedInUser } from "../auth/session";
import { useSupabase } from "../instance/instance-context";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import { readProfile, readUsers } from "./read-profiles";
import type { Tables, TablesUpdate } from "../supabase/database.types";

// Null once a pulled copy lacks the signed-in user: they were deleted.
export function useProfile() {
  const user = useSignedInUser();
  return useCopyQuery(["profile"], ({ rows }) => readProfile(rows, user.id));
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
  return useCopyQuery(["users"], ({ rows }) => readUsers(rows));
}

export function displayNameOf(users: User[], userId: string | null): string | undefined {
  return users.find(({ id }) => id === userId)?.display_name;
}

export type Profile = Tables<"profiles">;

export type User = Pick<Profile, "id" | "display_name">;

type ProfileChanges = Omit<TablesUpdate<"profiles">, "id" | "created_at">;
