import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Color } from "../colors/colors";
import { useSupabase } from "../instance/instance-context";
import type { Database } from "../supabase/database";
import type { Activity } from "../spaces/space-queries";

export function useCategories() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["categories"],
    async queryFn(): Promise<Category[]> {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return data;
    },
  });
}

export function useCategoryHistory(categoryId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["categories", categoryId, "history"],
    async queryFn(): Promise<Activity[]> {
      const { data, error } = await supabase
        .from("activity")
        .select("id, table_name, row_id, action, changed_by, changed_at, old, new")
        .eq("table_name", "ledger_accounts")
        // Including deletes of other categories that moved their transactions into this one.
        .or(`row_id.eq.${categoryId},old->moved_to->>id.eq.${categoryId}`)
        .order("id", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCategory() {
  const supabase = useSupabase();
  return useCategoryMutation(
    async ({ spaceId, ...details }: CategoryDetails & { spaceId: string }) => {
      const { data, error } = await supabase.rpc("create_category", {
        space: spaceId,
        ...detailsArgs(details),
      });
      if (error) throw error;
      return data;
    },
  );
}

export function useUpdateCategory(categoryId: string) {
  const supabase = useSupabase();
  return useCategoryMutation(async (details: CategoryDetails) => {
    const { error } = await supabase.rpc("update_category", {
      category_id: categoryId,
      ...detailsArgs(details),
    });
    if (error) throw error;
  });
}

export function useDeleteCategory(categoryId: string) {
  const supabase = useSupabase();
  return useCategoryMutation(async (moveTo: string | null) => {
    const { error } = await supabase.rpc("delete_category", {
      category_id: categoryId,
      move_to: moveTo,
    });
    if (error) throw error;
  });
}

// Category changes show up in their space's activity too.
function useCategoryMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["spaces"] }),
      ]),
  });
}

function detailsArgs(details: CategoryDetails) {
  return {
    category_name: details.name,
    category_kind: details.kind,
    category_icon: details.icon,
    category_color: details.color,
    parent: details.parentId,
  };
}

export type Category = Database["public"]["Views"]["categories"]["Row"];

export type CategoryKind = Category["kind"];

export type CategoryDetails = {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: Color;
  parentId: string | null;
};
