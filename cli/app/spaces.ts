import { createSpace } from "../../src/spaces/space-writes.ts";
import { type Commands, dataOf, noPositionals, parseCommand, required } from "./command.ts";
import { loadDirectory, type Space } from "./directory.ts";
import {
  contextOf,
  idField,
  type Output,
  printRows,
  printWritten,
  type View,
  withOutput,
} from "./output.ts";
import { signedIn } from "./session.ts";

const spaceView: View<Space> = {
  fields: [
    idField("id", (space) => space.id),
    { name: "name", json: (space) => space.name },
    { name: "private", json: (space) => space.private },
  ],
  columns: ["id", "name", "private"],
};

export const spaceCommands: Commands = {
  "spaces list": withOutput(spaceView, listSpaces),
  "spaces add": withOutput(spaceView, addSpace, { quiet: true }),
};

async function listSpaces(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {});
  noPositionals(positionals, "spaces list");
  const { supabase, userId } = await signedIn(values.env);
  const directory = await loadDirectory(supabase, userId);
  printRows(output, spaceView, directory.spaces, contextOf(directory));
}

// Members are added from the app. Starter categories follow the user's language, English if unset.
async function addSpace(argv: string[], output: Output) {
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
  const directory = await loadDirectory(supabase, userId);
  printWritten(output, spaceView, directory.space(id, "id"), contextOf(directory));
}
