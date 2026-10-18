// Shared with the app CLI, which runs under Node's type stripping: import only with extensions.
import type { AppSupabase } from "../supabase/client.ts";
import type { Database } from "../supabase/database.ts";
import type { Enums } from "../supabase/database.types.ts";

export async function createCategory(
  supabase: AppSupabase,
  spaceId: string,
  details: CategoryDetails,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_category", {
    space: spaceId,
    ...detailsArgs(details),
  });
  if (error) throw error;
  return data;
}

export async function updateCategory(
  supabase: AppSupabase,
  categoryId: string,
  details: CategoryDetails,
) {
  const { error } = await supabase.rpc("update_category", {
    category_id: categoryId,
    ...detailsArgs(details),
  });
  if (error) throw error;
}

export async function deleteCategory(
  supabase: AppSupabase,
  categoryId: string,
  moveTo: string | null,
) {
  const { error } = await supabase.rpc("delete_category", {
    category_id: categoryId,
    move_to: moveTo,
  });
  if (error) throw error;
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

export type CategoryDetails = {
  name: string;
  kind: Database["public"]["Views"]["categories"]["Row"]["kind"];
  icon: string;
  color: Enums<"color">;
  parentId: string | null;
};
