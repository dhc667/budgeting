// Shared with the app CLI, which runs under Node's type stripping: import only with extensions.
import type { AppSupabase } from "../supabase/client.ts";
import type { Enums } from "../supabase/database.types.ts";

// The space comes with starter categories named in starterLanguage.
export async function createSpace(
  supabase: AppSupabase,
  { name, memberIds, starterLanguage }: SpaceDetails,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_space", {
    space_name: name,
    member_ids: memberIds,
    starter_language: starterLanguage,
  });
  if (error) throw error;
  return data;
}

export type SpaceDetails = {
  name: string;
  memberIds: string[];
  starterLanguage: Enums<"language">;
};
