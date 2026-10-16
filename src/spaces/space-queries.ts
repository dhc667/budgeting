import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { shownLanguage } from "../i18n/languages";
import { useSupabase } from "../instance/instance-context";
import type { Tables } from "../supabase/database.types";
import { isPrivate } from "./space";

export function useSpaces() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["spaces"],
    async queryFn(): Promise<Space[]> {
      const { data, error } = await supabase
        .from("spaces")
        .select("id, name, private_owner, members:space_members(id, user_id)");
      if (error) throw error;
      return data.sort(privateFirstThenByName);
    },
  });
}

export function useSpaceActivity(spaceId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["spaces", spaceId, "activity"],
    async queryFn(): Promise<Activity[]> {
      const { data, error } = await supabase
        .from("activity")
        .select("id, table_name, row_id, action, changed_by, changed_at, old, new")
        .eq("space_id", spaceId)
        .order("id", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSpace() {
  const supabase = useSupabase();
  const { i18n } = useTranslation();
  return useSpaceMutation(async ({ name, memberIds }: { name: string; memberIds: string[] }) => {
    const { data, error } = await supabase.rpc("create_space", {
      space_name: name,
      member_ids: memberIds,
      starter_language: shownLanguage(i18n.resolvedLanguage),
    });
    if (error) throw error;
    return data;
  });
}

export function useRenameSpace(spaceId: string) {
  const supabase = useSupabase();
  return useSpaceMutation(async (name: string) => {
    const { error } = await supabase.from("spaces").update({ name }).eq("id", spaceId);
    if (error) throw error;
  });
}

export function useDeleteSpace(spaceId: string) {
  const supabase = useSupabase();
  return useSpaceMutation(async () => {
    const { error } = await supabase.from("spaces").delete().eq("id", spaceId);
    if (error) throw error;
  });
}

export function useAddMember(spaceId: string) {
  const supabase = useSupabase();
  return useSpaceMutation(async (userId: string) => {
    const { error } = await supabase
      .from("space_members")
      .insert({ space_id: spaceId, user_id: userId });
    if (error) throw error;
  });
}

export function useRemoveMember() {
  const supabase = useSupabase();
  return useSpaceMutation(async (membershipId: string) => {
    const { error } = await supabase.from("space_members").delete().eq("id", membershipId);
    if (error) throw error;
  });
}

// A space comes with its categories and takes them when it's deleted.
function useSpaceMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spaces"] }),
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
      ]),
  });
}

function privateFirstThenByName(a: Space, b: Space): number {
  if (isPrivate(a)) return -1;
  if (isPrivate(b)) return 1;
  return (a.name ?? "").localeCompare(b.name ?? "");
}

export type Space = Pick<Tables<"spaces">, "id" | "name" | "private_owner"> & {
  members: Pick<Tables<"space_members">, "id" | "user_id">[];
};

export type Activity = Pick<
  Tables<"activity">,
  "id" | "table_name" | "row_id" | "action" | "changed_by" | "changed_at" | "old" | "new"
>;
