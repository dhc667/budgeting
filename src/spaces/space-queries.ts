import { useTranslation } from "react-i18next";
import { shownLanguage } from "../i18n/languages";
import { useSupabase } from "../instance/instance-context";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import type { Tables } from "../supabase/database.types";
import { readSpaceActivity, readSpaces } from "./read-spaces";

export function useSpaces() {
  return useCopyQuery(["spaces"], ({ rows }) => readSpaces(rows));
}

export function useSpaceActivity(spaceId: string) {
  return useCopyQuery(["spaces", spaceId, "activity"], ({ rows }) =>
    readSpaceActivity(rows, spaceId),
  );
}

export function useCreateSpace() {
  const supabase = useSupabase();
  const { i18n } = useTranslation();
  return useCopyMutation(async ({ name, memberIds }: { name: string; memberIds: string[] }) => {
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
  return useCopyMutation(async (name: string) => {
    const { error } = await supabase.from("spaces").update({ name }).eq("id", spaceId);
    if (error) throw error;
  });
}

export function useDeleteSpace(spaceId: string) {
  const supabase = useSupabase();
  return useCopyMutation(async () => {
    const { error } = await supabase.from("spaces").delete().eq("id", spaceId);
    if (error) throw error;
  });
}

export function useAddMember(spaceId: string) {
  const supabase = useSupabase();
  return useCopyMutation(async (userId: string) => {
    const { error } = await supabase
      .from("space_members")
      .insert({ space_id: spaceId, user_id: userId });
    if (error) throw error;
  });
}

export function useRemoveMember() {
  const supabase = useSupabase();
  return useCopyMutation(async (membershipId: string) => {
    const { error } = await supabase.from("space_members").delete().eq("id", membershipId);
    if (error) throw error;
  });
}

export type Space = Pick<Tables<"spaces">, "id" | "name" | "private_owner"> & {
  members: Pick<Tables<"space_members">, "id" | "user_id">[];
};
