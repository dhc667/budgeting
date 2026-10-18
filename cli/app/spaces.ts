import { fail } from "../fail.ts";
import type { AppSupabase } from "../../src/supabase/client.ts";
import { createSpace } from "../../src/spaces/space-writes.ts";
import { type Commands, dataOf, noPositionals, parseCommand, print, required } from "./command.ts";
import { signedIn } from "./session.ts";

export const spaceCommands: Commands = { "spaces list": listSpaces, "spaces add": addSpace };

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

// Members are added from the app. Starter categories follow the user's language, English if unset.
async function addSpace(argv: string[]) {
  const { values, positionals } = parseCommand(argv, { name: { type: "string" } });
  noPositionals(positionals, "spaces add --name <name>");
  const { supabase, userId } = await signedIn(values.env);
  const profile = await dataOf(
    supabase.from("profiles").select("language").eq("id", userId).single(),
  );
  const id = await createSpace(supabase, {
    name: required(values.name, "--name"),
    memberIds: [],
    starterLanguage: profile.language ?? "en",
  });
  const space = await dataOf(supabase.from("spaces").select("id, name").eq("id", id).single());
  print({ ...space, private: false });
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
