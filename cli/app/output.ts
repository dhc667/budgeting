import { fail } from "../fail.ts";
import type { Directory } from "./directory.ts";
import { formatAmount, wholeUnits } from "./money.ts";

// After the GitHub CLI: a table on a terminal, tab-separated lines with a header row when piped,
// and JSON of the fields asked for with --json. `--json` alone lists the fields, before anything
// is read or written.
export function withOutput<Row, Ctx>(
  view: View<Row, Ctx>,
  run: (argv: string[], output: Output) => Promise<void>,
  { quiet: quietAllowed = false } = {},
) {
  return async (argv: string[]) => {
    const { rest, json, quiet } = takeOutputFlags(argv, quietAllowed);
    if (json === "list") {
      console.log(view.fields.map(({ name }) => name).join("\n"));
      return;
    }
    if (json) checkFields(view, json);
    await run(rest, { json, quiet });
  };
}

// For deletes, which print nothing to pick fields from.
export function withQuiet(run: (argv: string[], output: Output) => Promise<void>) {
  return async (argv: string[]) => {
    const { rest, json, quiet } = takeOutputFlags(argv, true);
    if (json) fail("--json is for commands that print what they read or write.");
    await run(rest, { json: null, quiet });
  };
}

export function printRows<Row, Ctx>(
  output: Output,
  view: View<Row, Ctx>,
  rows: Row[],
  context: Ctx,
) {
  if (output.json) {
    printJson(rows.map((row) => jsonOf(view, row, output.json ?? [], context)));
    return;
  }
  const columns = view.columns.map((name) => fieldNamed(view, name));
  const cells = rows.map((row) => columns.map((field) => textOf(field, row, context)));
  if (process.stdout.isTTY) {
    printTable([columns.map(({ name }) => name.replaceAll("_", " ").toUpperCase()), ...cells]);
  } else {
    for (const line of [columns.map(({ name }) => name), ...cells]) {
      console.log(line.map(tsvCell).join("\t"));
    }
  }
}

export function printRow<Row, Ctx>(output: Output, view: View<Row, Ctx>, row: Row, context: Ctx) {
  if (output.json) {
    printJson(jsonOf(view, row, output.json, context));
    return;
  }
  const lines = view.fields
    .map((field) => [field.name, textOf(field, row, context)])
    .filter(([, value]) => value !== "");
  if (process.stdout.isTTY) {
    printTable(lines.map(([name = "", value = ""]) => [`${name}:`, value]));
  } else {
    for (const line of lines) console.log(line.map(tsvCell).join("\t"));
  }
}

// What add and update print: with --quiet, only the id, to use in the next command.
export function printWritten<Row extends { id: string }, Ctx>(
  output: Output,
  view: View<Row, Ctx>,
  row: Row,
  context: Ctx,
) {
  if (output.quiet) console.log(row.id);
  else printRow(output, view, row, context);
}

export function printDeleted(output: Output, what: string, shortId: string) {
  if (!output.quiet) console.log(`Deleted ${what} ${shortId}.`);
}

export function contextOf(directory: Directory, otherIds: string[] = []): Context {
  return { directory, shortId: (id) => directory.shortId(id, otherIds) };
}

// The whole id in JSON; a table shows the shortest prefix that tells it apart.
export function idField<Row>(name: string, idOf: (row: Row) => string | null): Field<Row> {
  return {
    name,
    json: (row) => idOf(row),
    text: (row, { shortId }) => {
      const id = idOf(row);
      return id === null ? "" : shortId(id);
    },
  };
}

export function amountField<Row>(
  name: string,
  amountOf: (row: Row) => { minorUnits: number | null; currency: string | null },
): Field<Row> {
  return {
    name,
    json: (row, { directory }) => {
      const { minorUnits, currency } = amountOf(row);
      if (minorUnits === null || currency === null) return null;
      return wholeUnits(minorUnits, directory.decimals(currency));
    },
    text: (row, { directory }) => {
      const { minorUnits, currency } = amountOf(row);
      if (minorUnits === null || currency === null) return "";
      return formatAmount(minorUnits, currency, directory.decimals(currency));
    },
  };
}

function takeOutputFlags(argv: string[], quietAllowed: boolean) {
  const rest: string[] = [];
  let json: Output["json"] | "list" = null;
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];
    if (arg.startsWith("--json=")) {
      json = fieldList(arg.slice("--json=".length));
    } else if (arg === "--json") {
      if (next === undefined || next.startsWith("-")) {
        json = "list";
      } else {
        json = fieldList(next);
        i++;
      }
    } else if (arg === "--quiet" && quietAllowed) {
      quiet = true;
    } else {
      rest.push(arg);
    }
  }
  return { rest, json, quiet };
}

function fieldList(text: string): string[] {
  return text
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field !== "");
}

function checkFields<Row, Ctx>(view: View<Row, Ctx>, names: string[]) {
  const unknown = names.filter((name) => !view.fields.some((field) => field.name === name));
  if (unknown.length > 0) {
    fail(
      `Unknown --json field ${unknown.join(", ")}. The fields are:\n${view.fields.map(({ name }) => `  ${name}`).join("\n")}`,
    );
  }
}

function jsonOf<Row, Ctx>(view: View<Row, Ctx>, row: Row, names: string[], context: Ctx) {
  return Object.fromEntries(names.map((name) => [name, fieldNamed(view, name).json(row, context)]));
}

function textOf<Row, Ctx>(field: Field<Row, Ctx>, row: Row, context: Ctx): string {
  if (field.text) return field.text(row, context);
  const value = field.json(row, context);
  if (value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function fieldNamed<Row, Ctx>(view: View<Row, Ctx>, name: string): Field<Row, Ctx> {
  const field = view.fields.find((candidate) => candidate.name === name);
  if (!field) throw new Error(`The view has no field ${name}.`);
  return field;
}

function printJson(value: Json) {
  console.log(process.stdout.isTTY ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}

function printTable(rows: string[][]) {
  const widths = rows.reduce<number[]>(
    (max, row) => row.map((cell, i) => Math.max(max[i] ?? 0, cell.length)),
    [],
  );
  for (const row of rows) {
    console.log(
      row
        .map((cell, i) => cell.padEnd(widths[i] ?? 0))
        .join("  ")
        .trimEnd(),
    );
  }
}

function tsvCell(text: string): string {
  return text.replace(/[\t\r\n]+/g, " ");
}

export type Output = { json: string[] | null; quiet: boolean };

export type View<Row, Ctx = Context> = {
  fields: Field<Row, Ctx>[];
  columns: string[];
};

export type Field<Row, Ctx = Context> = {
  name: string;
  json: (row: Row, context: Ctx) => Json;
  // How a table shows it, when that isn't the JSON value as text.
  text?: (row: Row, context: Ctx) => string;
};

export type Context = { directory: Directory; shortId: (id: string) => string };

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
