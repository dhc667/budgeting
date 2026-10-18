import { color } from "../../db/schema.ts";
import {
  createCounterparty,
  deleteCounterparty,
  updateCounterparty,
} from "../../src/counterparties/counterparty-writes.ts";
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

export const counterpartyCommands: Commands = {
  "counterparties list": listCounterparties,
  "counterparties add": addCounterparty,
  "counterparties update": changeCounterparty,
  "counterparties delete": removeCounterparty,
};

// Each with what it owes per currency: above zero it owes the space, below the space owes it.
async function listCounterparties(argv: string[]) {
  const { values, positionals } = parseCommand(argv, { space: { type: "string" } });
  noPositionals(positionals, "counterparties list [--space <id>]");
  const { supabase, userId } = await signedIn(values.env);
  const spaceId = await spaceOrPrivate(supabase, userId, values.space);
  const counterparties = await dataOf(
    supabase
      .from("ledger_accounts")
      .select("id, space_id, name, color")
      .eq("kind", "counterparty")
      .eq("space_id", spaceId)
      .order("name"),
  );
  const postings = await dataOf(
    supabase
      .from("postings")
      .select("ledger_account_id, currency, amount")
      .in(
        "ledger_account_id",
        counterparties.map(({ id }) => id),
      ),
  );
  print(
    counterparties.map((counterparty) => ({
      ...counterparty,
      owed: owedByCurrency(postings.filter((p) => p.ledger_account_id === counterparty.id)),
    })),
  );
}

async function addCounterparty(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    name: { type: "string" },
    color: { type: "string" },
  });
  noPositionals(positionals, "counterparties add --name <name> [--space <id>] [--color <color>]");
  const { supabase, userId } = await signedIn(values.env);
  const spaceId = await spaceOrPrivate(supabase, userId, values.space);
  const id = await createCounterparty(supabase, spaceId, {
    name: required(values.name, "--name"),
    color: values.color === undefined ? "slate" : choice(values.color, color.enumValues, "--color"),
  });
  print(await counterparty(supabase, id));
}

// What isn't given keeps its value.
async function changeCounterparty(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {
    name: { type: "string" },
    color: { type: "string" },
  });
  const id = onlyId(positionals, "counterparties update <id> [--name <name>] [--color <color>]");
  const { supabase } = await signedIn(values.env);
  const current = await counterparty(supabase, id);
  await updateCounterparty(supabase, id, {
    name: values.name ?? current.name,
    color:
      values.color === undefined
        ? current.color
        : choice(values.color, color.enumValues, "--color"),
  });
  print(await counterparty(supabase, id));
}

async function removeCounterparty(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {});
  const id = onlyId(positionals, "counterparties delete <id>");
  const { supabase } = await signedIn(values.env);
  await deleteCounterparty(supabase, id);
  print({ deleted: id });
}

async function counterparty(supabase: AppSupabase, id: string) {
  const found = await dataOf(
    supabase
      .from("ledger_accounts")
      .select("id, space_id, name, color")
      .eq("kind", "counterparty")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!found?.name || !found.color) fail(`No counterparty ${id} that you can see.`);
  return { ...found, name: found.name, color: found.color };
}

function owedByCurrency(postings: { currency: string; amount: number }[]): Record<string, number> {
  const owed: Record<string, number> = {};
  for (const { currency, amount } of postings) owed[currency] = (owed[currency] ?? 0) + amount;
  return owed;
}
