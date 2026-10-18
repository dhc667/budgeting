import { fail } from "../fail.ts";
import type { AppSupabase } from "../../src/supabase/client.ts";
import { type Commands, dataOf, noPositionals, parseCommand, print } from "./command.ts";
import { signedIn } from "./session.ts";

export const spaceCommands: Commands = { "spaces list": listSpaces };

async function listSpaces(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {});
  noPositionals(positionals, "spaces list");
  const { supabase, userId } = await signedIn(values.env);
  const spaces = await dataOf(
    supabase.from("spaces").select("id, name, private_owner").order("created_at"),
  );
  print(
    spaces.map(({ id, name, private_owner }) => ({
      id,
      name,
      private: private_owner === userId,
    })),
  );
}

export async function spaceOrPrivate(
  supabase: AppSupabase,
  userId: string,
  spaceId: string | undefined,
): Promise<string> {
  if (spaceId) return spaceId;
  const { data, error } = await supabase
    .from("spaces")
    .select("id")
    .eq("private_owner", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) fail("You have no private space; pass --space.");
  return data.id;
}
