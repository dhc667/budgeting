import { useSupabase } from "../instance/instance-context";
import type { Database } from "../supabase/database";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import {
  type CategoryDetails,
  createCategory,
  deleteCategory,
  updateCategory,
} from "./category-writes";
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
  return useCopyMutation(({ spaceId, ...details }: CategoryDetails & { spaceId: string }) =>
    createCategory(supabase, spaceId, details),
  );
}

export function useUpdateCategory(categoryId: string) {
  const supabase = useSupabase();
  return useCopyMutation((details: CategoryDetails) =>
    updateCategory(supabase, categoryId, details),
  );
}

export function useDeleteCategory(categoryId: string) {
  const supabase = useSupabase();
  return useCopyMutation((moveTo: string | null) => deleteCategory(supabase, categoryId, moveTo));
}

export type Category = Database["public"]["Views"]["categories"]["Row"];

export type CategoryKind = Category["kind"];
