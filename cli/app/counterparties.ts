import { Constants } from "../../src/supabase/database.types.ts";
import {
  createCounterparty,
  deleteCounterparty,
  updateCounterparty,
} from "../../src/counterparties/counterparty-writes.ts";
import type { AppSupabase } from "../../src/supabase/client.ts";
import {
  choice,
  type Commands,
  dataOf,
  noPositionals,
  onlyId,
  parseCommand,
  required,
} from "./command.ts";
import { type Counterparty, loadDirectory, signedInDirectory } from "./directory.ts";
import { formatAmount, wholeUnits } from "./money.ts";
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

// What it owes per currency: above zero it owes the space, below the space owes it.
const counterpartyView: View<OwingCounterparty> = {
  fields: [
    idField("id", (counterparty) => counterparty.id),
    idField("space_id", (counterparty) => counterparty.space_id),
    {
      name: "space",
      json: (counterparty, { directory }) => directory.spaceName(counterparty.space_id),
    },
    { name: "name", json: (counterparty) => counterparty.name },
    { name: "color", json: (counterparty) => counterparty.color },
    {
      name: "owed",
      json: (counterparty, { directory }) =>
        Object.fromEntries(
          counterparty.owed.map(({ currency, minorUnits }) => [
            currency,
            wholeUnits(minorUnits, directory.decimals(currency)),
          ]),
        ),
      text: (counterparty, { directory }) =>
        counterparty.owed
          .map(({ currency, minorUnits }) =>
            formatAmount(minorUnits, currency, directory.decimals(currency)),
          )
          .join(", "),
    },
  ],
  columns: ["id", "space", "name", "owed"],
};

export const counterpartyCommands: Commands = {
  "counterparties list": withOutput(counterpartyView, listCounterparties),
  "counterparties add": withOutput(counterpartyView, addCounterparty, { quiet: true }),
  "counterparties update": withOutput(counterpartyView, changeCounterparty, { quiet: true }),
  "counterparties delete": withQuiet(removeCounterparty),
};

async function listCounterparties(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, { space: { type: "string" } });
  noPositionals(positionals, "counterparties list [--space <space>]");
  const { supabase, directory } = await signedInDirectory(values.env);
  const space = directory.spaceOrPrivate(values.space);
  const counterparties = directory.counterparties.filter(({ space_id }) => space_id === space.id);
  printRows(
    output,
    counterpartyView,
    await withOwed(supabase, counterparties),
    contextOf(directory),
  );
}

async function addCounterparty(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    name: { type: "string" },
    color: { type: "string" },
  });
  noPositionals(
    positionals,
    "counterparties add --name <name> [--space <space>] [--color <color>]",
  );
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const space = directory.spaceOrPrivate(values.space);
  const id = await createCounterparty(supabase, space.id, {
    name: required(values.name, "--name"),
    color:
      values.color === undefined
        ? "slate"
        : choice(values.color, Constants.public.Enums.color, "--color"),
  });
  await printCounterparty(output, supabase, userId, id);
}

// What isn't given keeps its value.
async function changeCounterparty(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {
    name: { type: "string" },
    color: { type: "string" },
  });
  const named = onlyId(
    positionals,
    "counterparties update <counterparty> [--name <name>] [--color <color>]",
  );
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const current = directory.counterparty(named, "counterparty");
  await updateCounterparty(supabase, current.id, {
    name: values.name ?? current.name,
    color:
      values.color === undefined
        ? current.color
        : choice(values.color, Constants.public.Enums.color, "--color"),
  });
  await printCounterparty(output, supabase, userId, current.id);
}

async function removeCounterparty(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {});
  const named = onlyId(positionals, "counterparties delete <counterparty>");
  const { supabase, directory } = await signedInDirectory(values.env);
  const { id } = directory.counterparty(named, "counterparty");
  await deleteCounterparty(supabase, id);
  printDeleted(output, "counterparty", directory.shortId(id));
}

async function printCounterparty(
  output: Output,
  supabase: AppSupabase,
  userId: string,
  id: string,
) {
  const directory = await loadDirectory(supabase, userId);
  const [counterparty] = await withOwed(supabase, [directory.counterparty(id, "id")]);
  if (counterparty) printWritten(output, counterpartyView, counterparty, contextOf(directory));
}

async function withOwed(
  supabase: AppSupabase,
  counterparties: Counterparty[],
): Promise<OwingCounterparty[]> {
  const postings = await dataOf(
    supabase
      .from("postings")
      .select("ledger_account_id, currency, amount")
      .in(
        "ledger_account_id",
        counterparties.map(({ id }) => id),
      ),
  );
  return counterparties.map((counterparty) => {
    const owed = new Map<string, number>();
    for (const { ledger_account_id, currency, amount } of postings) {
      if (ledger_account_id === counterparty.id) {
        owed.set(currency, (owed.get(currency) ?? 0) + amount);
      }
    }
    return {
      ...counterparty,
      owed: [...owed].map(([currency, minorUnits]) => ({ currency, minorUnits })),
    };
  });
}

type OwingCounterparty = Counterparty & { owed: { currency: string; minorUnits: number }[] };
