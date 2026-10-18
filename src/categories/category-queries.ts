import { useTranslation } from "react-i18next";
import { useSupabase } from "../instance/instance-context";
import type { Database } from "../supabase/database";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import {
  type CategoryDetails,
  createCategory,
  deleteCategory,
  updateCategory,
} from "./category-writes";
import { builtInCategoryName } from "./category";
import { readCategories, readCategoryHistory } from "./read-categories";

export function useCategories() {
  const { t, i18n } = useTranslation();
  return useCopyQuery(["categories", i18n.language], ({ rows }) =>
    readCategories(rows, (builtIn) => builtInCategoryName(builtIn, t)),
  );
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

// Always named: a built-in category is called whatever the app's language calls it.
export type Category = Omit<Database["public"]["Views"]["categories"]["Row"], "name"> & {
  name: string;
};

export type CategoryKind = Category["kind"];

export type BuiltInCategory = NonNullable<Category["built_in"]>;
