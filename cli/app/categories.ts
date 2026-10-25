import type { ParseArgsOptionsConfig } from "node:util";
import { Constants } from "../../src/supabase/database.types.ts";
import {
  type CategoryDetails,
  createCategory,
  deleteCategory,
  updateCategory,
} from "../../src/categories/category-writes.ts";
import type { AppSupabase } from "../../src/supabase/client.ts";
import { fail } from "../fail.ts";
import { choice, type Commands, noPositionals, onlyId, parseCommand, required } from "./command.ts";
import { type Category, type CategoryKind, loadDirectory, signedInDirectory } from "./directory.ts";
import {
  contextOf,
  idField,
  type Output,
  printDeleted,
  printRows,
  printWritten,
  type View,
  withOutput,
  withQuiet,
} from "./output.ts";

const categoryView: View<Category> = {
  fields: [
    idField("id", (category) => category.id),
    idField("space_id", (category) => category.space_id),
    { name: "space", json: (category, { directory }) => directory.spaceName(category.space_id) },
    { name: "kind", json: (category) => category.kind },
    { name: "name", json: (category) => category.name },
    { name: "path", json: (category, { directory }) => directory.categoryPath(category.id) },
    { name: "built_in", json: (category) => category.built_in },
    { name: "icon", json: (category) => category.icon },
    { name: "color", json: (category) => category.color },
    idField("parent_id", (category) => category.parent_id),
    { name: "transaction_count", json: (category) => category.transaction_count },
  ],
  columns: ["id", "space", "kind", "path", "transaction_count"],
};

export const categoryCommands: Commands = {
  "categories list": withOutput(categoryView, listCategories),
  "categories add": withOutput(categoryView, addCategory, { quiet: true }),
  "categories update": withOutput(categoryView, changeCategory, { quiet: true }),
  "categories delete": withQuiet(removeCategory),
};

async function listCategories(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    kind: { type: "string" },
  });
  noPositionals(positionals, "categories list [--space <space>] [--kind expense|income]");
  const { directory } = await signedInDirectory(values.env);
  const space = directory.spaceOrPrivate(values.space);
  const kind = values.kind === undefined ? undefined : choice(values.kind, kinds, "--kind");
  const path = (category: Category) => directory.categoryPath(category.id) ?? "";
  const categories = directory.categories
    .filter(
      (category) =>
        category.space_id === space.id && (kind === undefined || category.kind === kind),
    )
    .sort((a, b) => a.kind.localeCompare(b.kind) || path(a).localeCompare(path(b)));
  printRows(output, categoryView, categories, contextOf(directory));
}

async function addCategory(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    ...detailOptions,
  });
  noPositionals(positionals, "categories add --name <name> [--kind expense|income] [options]");
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const space = directory.spaceOrPrivate(values.space);
  const parent =
    values.parent === undefined
      ? undefined
      : directory.category(values.parent, "--parent", { spaceId: space.id });
  const id = await createCategory(supabase, space.id, {
    name: required(values.name, "--name"),
    kind: required(kindUnder(parent, values.kind), "--kind"),
    icon: values.icon ?? "tag",
    color:
      values.color === undefined
        ? "blue"
        : choice(values.color, Constants.public.Enums.color, "--color"),
    parentId: parent?.id ?? null,
  });
  await printCategory(output, supabase, userId, id);
}

// What isn't given keeps its value.
async function changeCategory(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {
    ...detailOptions,
    "no-parent": { type: "boolean", default: false },
  });
  const named = onlyId(positionals, "categories update <category> [options]");
  if (values.parent !== undefined && values["no-parent"]) {
    fail("Pass --parent or --no-parent, not both.");
  }
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const current = directory.category(named, "category");
  const parent = values["no-parent"]
    ? undefined
    : values.parent === undefined
      ? directory.categories.find(({ id }) => id === current.parent_id)
      : directory.category(values.parent, "--parent", { spaceId: current.space_id });
  const details: CategoryDetails = {
    // A built-in category has none, and keeps none whatever is sent.
    name: values.name ?? current.name ?? "",
    kind: kindUnder(parent, values.kind) ?? current.kind,
    icon: values.icon ?? current.icon,
    color:
      values.color === undefined
        ? current.color
        : choice(values.color, Constants.public.Enums.color, "--color"),
    parentId: parent?.id ?? null,
  };
  await updateCategory(supabase, current.id, details);
  await printCategory(output, supabase, userId, current.id);
}

async function removeCategory(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, { "move-to": { type: "string" } });
  const named = onlyId(positionals, "categories delete <category> [--move-to <category>]");
  const { supabase, directory } = await signedInDirectory(values.env);
  const category = directory.category(named, "category");
  const moveTo =
    values["move-to"] === undefined
      ? null
      : directory.category(values["move-to"], "--move-to", {
          spaceId: category.space_id,
          kind: category.kind,
        }).id;
  await deleteCategory(supabase, category.id, moveTo);
  printDeleted(output, "category", directory.shortId(category.id));
}

async function printCategory(output: Output, supabase: AppSupabase, userId: string, id: string) {
  const directory = await loadDirectory(supabase, userId);
  printWritten(output, categoryView, directory.category(id, "id"), contextOf(directory));
}

// A subcategory is of its parent's kind, as in the app.
function kindUnder(
  parent: Category | undefined,
  given: string | undefined,
): CategoryKind | undefined {
  const kind = given === undefined ? undefined : choice(given, kinds, "--kind");
  if (parent && kind !== undefined && kind !== parent.kind) {
    fail(
      `--kind: a subcategory is of its parent's kind, and ${parent.name ?? ""} is ${parent.kind}.`,
    );
  }
  return parent?.kind ?? kind;
}

const kinds: CategoryKind[] = ["expense", "income"];

const detailOptions = {
  name: { type: "string" },
  kind: { type: "string" },
  // A Lucide icon name; the app draws a fallback for one it doesn't offer.
  icon: { type: "string" },
  color: { type: "string" },
  parent: { type: "string" },
} satisfies ParseArgsOptionsConfig;
