import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignedInUser } from "../auth/session";
import { useSupabase } from "../instance/instance-context";
import type { Tables, TablesUpdate } from "../supabase/database.types";

export function useProfile() {
  const supabase = useSupabase();
  const user = useSignedInUser();
  return useQuery({
    queryKey: ["profile"],
    async queryFn() {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile() {
  const supabase = useSupabase();
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    async mutationFn(changes: ProfileChanges) {
      const { error } = await supabase.from("profiles").update(changes).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export function useUsers() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["users"],
    async queryFn(): Promise<User[]> {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });
}

export function displayNameOf(users: User[], userId: string | null): string | undefined {
  return users.find(({ id }) => id === userId)?.display_name;
}

export type Profile = Tables<"profiles">;

export type User = Pick<Profile, "id" | "display_name">;

type ProfileChanges = Omit<TablesUpdate<"profiles">, "id" | "created_at">;
