import type { ParseArgsOptionsConfig } from "node:util";
import { color } from "../../db/schema.ts";
import {
  type CategoryDetails,
  createCategory,
  deleteCategory,
  updateCategory,
} from "../../src/categories/category-writes.ts";
import type { AppSupabase } from "../../src/supabase/client.ts";
import { fail } from "../fail.ts";
import {
  choice,
  type Commands,
  dataOf,
  noPositionals,
  onlyId,
  parseCommand,
  print,
  required,
} from "./command.ts";
import { signedIn } from "./session.ts";
import { spaceOrPrivate } from "./spaces.ts";

export const categoryCommands: Commands = {
  "categories list": listCategories,
  "categories add": addCategory,
  "categories update": changeCategory,
  "categories delete": removeCategory,
};

async function listCategories(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    kind: { type: "string" },
  });
  noPositionals(positionals, "categories list [--space <id>] [--kind expense|income]");
  const { supabase } = await signedIn(values.env);
  let query = supabase.from("categories").select(columns).order("kind").order("name");
  if (values.space) query = query.eq("space_id", values.space);
  if (values.kind) query = query.eq("kind", choice(values.kind, kinds, "--kind"));
  print(await dataOf(query));
}

async function addCategory(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    ...detailOptions,
  });
  noPositionals(positionals, "categories add --name <name> --kind expense|income [options]");
  const { supabase, userId } = await signedIn(values.env);
  const spaceId = await spaceOrPrivate(supabase, userId, values.space);
  const id = await createCategory(supabase, spaceId, {
    name: required(values.name, "--name"),
    kind: choice(required(values.kind, "--kind"), kinds, "--kind"),
    icon: values.icon ?? "tag",
    color: values.color === undefined ? "blue" : choice(values.color, color.enumValues, "--color"),
    parentId: values.parent ?? null,
  });
  print(await category(supabase, id));
}

// What isn't given keeps its value.
async function changeCategory(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {
    ...detailOptions,
    "no-parent": { type: "boolean", default: false },
  });
  const id = onlyId(positionals, "categories update <id> [options]");
  if (values.parent !== undefined && values["no-parent"]) {
    fail("Pass --parent or --no-parent, not both.");
  }
  const { supabase } = await signedIn(values.env);
  const current = await category(supabase, id);
  const details: CategoryDetails = {
    name: values.name ?? current.name,
    kind: values.kind === undefined ? current.kind : choice(values.kind, kinds, "--kind"),
    icon: values.icon ?? current.icon,
    color:
      values.color === undefined
        ? current.color
        : choice(values.color, color.enumValues, "--color"),
    parentId: values["no-parent"] ? null : (values.parent ?? current.parent_id),
  };
  await updateCategory(supabase, id, details);
  print(await category(supabase, id));
}

async function removeCategory(argv: string[]) {
  const { values, positionals } = parseCommand(argv, { "move-to": { type: "string" } });
  const id = onlyId(positionals, "categories delete <id> [--move-to <id>]");
  const { supabase } = await signedIn(values.env);
  await category(supabase, id);
  await deleteCategory(supabase, id, values["move-to"] ?? null);
  print({ deleted: id });
}

async function category(supabase: AppSupabase, id: string) {
  const found = await dataOf(
    supabase.from("categories").select(columns).eq("id", id).maybeSingle(),
  );
  if (!found) fail(`No category ${id} that you can see.`);
  return found;
}

const kinds: CategoryDetails["kind"][] = ["expense", "income"];

const columns = "id, space_id, kind, name, icon, color, parent_id, transaction_count";

const detailOptions = {
  name: { type: "string" },
  kind: { type: "string" },
  // A Lucide icon name; the app draws a fallback for one it doesn't offer.
  icon: { type: "string" },
  color: { type: "string" },
  parent: { type: "string" },
} satisfies ParseArgsOptionsConfig;
