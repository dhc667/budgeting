import type { ParseArgsOptionsConfig } from "node:util";
import { color } from "../../db/schema.ts";
import {
  type AccountDetails,
  archiveAccount,
  createAccount,
  deleteAccount,
  updateAccount,
} from "../../src/accounts/account-writes.ts";
import { localToday } from "../../src/format/days.ts";
import type { AppSupabase } from "../../src/supabase/client.ts";
import { fail } from "../fail.ts";
import {
  choice,
  type Commands,
  dataOf,
  day,
  integer,
  noPositionals,
  onlyId,
  parseCommand,
  print,
  required,
} from "./command.ts";
import { signedIn } from "./session.ts";
import { spaceOrPrivate } from "./spaces.ts";

export const accountCommands: Commands = {
  "accounts list": listAccounts,
  "accounts add": addAccount,
  "accounts update": changeAccount,
  "accounts archive": (argv) => setArchived(argv, true),
  "accounts unarchive": (argv) => setArchived(argv, false),
  "accounts delete": removeAccount,
};

async function listAccounts(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    archived: { type: "boolean", default: false },
  });
  noPositionals(positionals, "accounts list [--space <id>] [--archived]");
  const { supabase, userId } = await signedIn(values.env);
  const spaceId = await spaceOrPrivate(supabase, userId, values.space);
  let query = supabase.from("accounts").select(columns).eq("space_id", spaceId).order("position");
  if (!values.archived) query = query.eq("archived", false);
  print(await dataOf(query));
}

async function addAccount(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    ...detailOptions,
  });
  noPositionals(positionals, "accounts add --name <name> --currency <code> [options]");
  const { supabase, userId } = await signedIn(values.env);
  const spaceId = await spaceOrPrivate(supabase, userId, values.space);
  const id = await createAccount(supabase, spaceId, {
    name: required(values.name, "--name"),
    currency: currency(required(values.currency, "--currency")),
    color: values.color === undefined ? "blue" : choice(values.color, color.enumValues, "--color"),
    openingAmount:
      values["opening-amount"] === undefined
        ? 0
        : integer(values["opening-amount"], "--opening-amount"),
    openingDate:
      values["opening-date"] === undefined
        ? localToday()
        : day(values["opening-date"], "--opening-date"),
  });
  print(await account(supabase, id));
}

// What isn't given keeps its value.
async function changeAccount(argv: string[]) {
  const { values, positionals } = parseCommand(argv, detailOptions);
  const id = onlyId(positionals, "accounts update <id> [options]");
  const { supabase } = await signedIn(values.env);
  const current = await account(supabase, id);
  const details: AccountDetails = {
    name: values.name ?? current.name,
    currency: values.currency === undefined ? current.currency : currency(values.currency),
    color:
      values.color === undefined
        ? current.color
        : choice(values.color, color.enumValues, "--color"),
    openingAmount:
      values["opening-amount"] === undefined
        ? current.opening_balance
        : integer(values["opening-amount"], "--opening-amount"),
    openingDate:
      values["opening-date"] === undefined
        ? (current.opening_date ?? localToday())
        : day(values["opening-date"], "--opening-date"),
  };
  await updateAccount(supabase, id, details);
  print(await account(supabase, id));
}

async function setArchived(argv: string[], archived: boolean) {
  const { values, positionals } = parseCommand(argv, {});
  const id = onlyId(positionals, `accounts ${archived ? "archive" : "unarchive"} <id>`);
  const { supabase } = await signedIn(values.env);
  await account(supabase, id);
  await archiveAccount(supabase, id, archived);
  print(await account(supabase, id));
}

// A delete the rules refuse matches no rows rather than failing, so only a second look can tell.
async function removeAccount(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {});
  const id = onlyId(positionals, "accounts delete <id>");
  const { supabase } = await signedIn(values.env);
  await account(supabase, id);
  await deleteAccount(supabase, id);
  if (await findAccount(supabase, id)) fail(`Account ${id} was not deleted.`);
  print({ deleted: id });
}

async function account(supabase: AppSupabase, id: string) {
  const found = await findAccount(supabase, id);
  if (!found) fail(`No account ${id} that you can see.`);
  return found;
}

async function findAccount(supabase: AppSupabase, id: string) {
  return dataOf(supabase.from("accounts").select(columns).eq("id", id).maybeSingle());
}

function currency(code: string): string {
  if (!/^[A-Z]{3}$/.test(code)) fail("--currency must be a three-letter code, like USD.");
  return code;
}

const columns =
  "id, space_id, name, currency, color, balance, opening_balance, opening_date, archived, has_transactions";

const detailOptions = {
  name: { type: "string" },
  currency: { type: "string" },
  color: { type: "string" },
  "opening-amount": { type: "string" },
  "opening-date": { type: "string" },
} satisfies ParseArgsOptionsConfig;
