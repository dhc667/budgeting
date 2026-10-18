import type { Color } from "../colors/colors";
import { useSupabase } from "../instance/instance-context";
import type { Database } from "../supabase/database";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import { readCategories, readCategoryHistory } from "./read-categories";

export function useCategories() {
  return useCopyQuery(["categories"], ({ rows }) => readCategories(rows));
}

export function useCategoryHistory(categoryId: string) {
  return useCopyQuery(["categories", categoryId, "history"], ({ rows }) =>
    readCategoryHistory(rows, categoryId),
  );
}

export function useCreateCategory() {
  const supabase = useSupabase();
  return useCopyMutation(async ({ spaceId, ...details }: CategoryDetails & { spaceId: string }) => {
    const { data, error } = await supabase.rpc("create_category", {
      space: spaceId,
      ...detailsArgs(details),
    });
    if (error) throw error;
    return data;
  });
}

export function useUpdateCategory(categoryId: string) {
  const supabase = useSupabase();
  return useCopyMutation(async (details: CategoryDetails) => {
    const { error } = await supabase.rpc("update_category", {
      category_id: categoryId,
      ...detailsArgs(details),
    });
    if (error) throw error;
  });
}

export function useDeleteCategory(categoryId: string) {
  const supabase = useSupabase();
  return useCopyMutation(async (moveTo: string | null) => {
    const { error } = await supabase.rpc("delete_category", {
      category_id: categoryId,
      move_to: moveTo,
    });
    if (error) throw error;
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
