import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignedInUser } from "../auth/session";
import { useSupabase } from "../instance/instance-context";
import type { Tables, TablesUpdate } from "../supabase/database.types";

export function useProfile() {
  const supabase = useSupabase();
  const user = useSignedInUser();
  return useQuery({
    queryKey: ["profile", user.id],
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
    async mutationFn(changes: Pick<TablesUpdate<"profiles">, "display_name" | "display_currency">) {
      const { error } = await supabase.from("profiles").update(changes).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", user.id] }),
  });
}

export type Profile = Tables<"profiles">;
