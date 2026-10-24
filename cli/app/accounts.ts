import type { ParseArgsOptionsConfig } from "node:util";
import { Constants } from "../../src/supabase/database.types.ts";
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
  day,
  noPositionals,
  onlyId,
  parseCommand,
  required,
} from "./command.ts";
import { type Account, type Directory, loadDirectory, signedInDirectory } from "./directory.ts";
import { parseAmount } from "./money.ts";
import {
  amountField,
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

const accountView: View<Account> = {
  fields: [
    idField("id", (account) => account.id),
    idField("space_id", (account) => account.space_id),
    { name: "space", json: (account, { directory }) => directory.spaceName(account.space_id) },
    { name: "name", json: (account) => account.name },
    { name: "currency", json: (account) => account.currency },
    { name: "color", json: (account) => account.color },
    amountField("balance", (account) => ({
      minorUnits: account.balance,
      currency: account.currency,
    })),
    amountField("opening_balance", (account) => ({
      minorUnits: account.opening_balance,
      currency: account.currency,
    })),
    { name: "opening_date", json: (account) => account.opening_date },
    { name: "archived", json: (account) => account.archived },
    { name: "has_transactions", json: (account) => account.has_transactions },
  ],
  columns: ["id", "space", "name", "balance", "archived"],
};

export const accountCommands: Commands = {
  "accounts list": withOutput(accountView, listAccounts),
  "accounts add": withOutput(accountView, addAccount, { quiet: true }),
  "accounts update": withOutput(accountView, changeAccount, { quiet: true }),
  "accounts archive": withOutput(accountView, (argv, output) => setArchived(argv, output, true)),
  "accounts unarchive": withOutput(accountView, (argv, output) => setArchived(argv, output, false)),
  "accounts delete": withQuiet(removeAccount),
};

async function listAccounts(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    archived: { type: "boolean", default: false },
  });
  noPositionals(positionals, "accounts list [--space <space>] [--archived]");
  const { directory } = await signedInDirectory(values.env);
  const space = directory.spaceOrPrivate(values.space);
  const accounts = directory.accounts.filter(
    ({ space_id, archived }) => space_id === space.id && (values.archived || !archived),
  );
  printRows(output, accountView, accounts, contextOf(directory));
}

async function addAccount(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    ...detailOptions,
  });
  noPositionals(positionals, "accounts add --name <name> --currency <code> [options]");
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const space = directory.spaceOrPrivate(values.space);
  const currency = currencyCode(required(values.currency, "--currency"));
  const id = await createAccount(supabase, space.id, {
    name: required(values.name, "--name"),
    currency,
    color:
      values.color === undefined
        ? "blue"
        : choice(values.color, Constants.public.Enums.color, "--color"),
    openingAmount: openingAmount(values["opening-amount"], currency, directory) ?? 0,
    openingDate:
      values["opening-date"] === undefined
        ? localToday()
        : day(values["opening-date"], "--opening-date"),
  });
  await printAccount(output, supabase, userId, id);
}

// What isn't given keeps its value.
async function changeAccount(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, detailOptions);
  const named = onlyId(positionals, "accounts update <account> [options]");
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const current = directory.account(named, "account");
  const currency = values.currency === undefined ? current.currency : currencyCode(values.currency);
  const details: AccountDetails = {
    name: values.name ?? current.name,
    currency,
    color:
      values.color === undefined
        ? current.color
        : choice(values.color, Constants.public.Enums.color, "--color"),
    openingAmount:
      openingAmount(values["opening-amount"], currency, directory) ?? current.opening_balance,
    openingDate:
      values["opening-date"] === undefined
        ? (current.opening_date ?? localToday())
        : day(values["opening-date"], "--opening-date"),
  };
  await updateAccount(supabase, current.id, details);
  await printAccount(output, supabase, userId, current.id);
}

async function setArchived(argv: string[], output: Output, archived: boolean) {
  const { values, positionals } = parseCommand(argv, {});
  const named = onlyId(positionals, `accounts ${archived ? "archive" : "unarchive"} <account>`);
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const { id } = directory.account(named, "account");
  await archiveAccount(supabase, id, archived);
  await printAccount(output, supabase, userId, id);
}

// A delete the rules refuse matches no rows rather than failing, so only a second look can tell.
async function removeAccount(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {});
  const named = onlyId(positionals, "accounts delete <account>");
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const { id } = directory.account(named, "account");
  const shortId = directory.shortId(id);
  await deleteAccount(supabase, id);
  const after = await loadDirectory(supabase, userId);
  if (after.accounts.some((account) => account.id === id)) {
    fail(`Account ${shortId} was not deleted.`);
  }
  printDeleted(output, "account", shortId);
}

async function printAccount(output: Output, supabase: AppSupabase, userId: string, id: string) {
  const directory = await loadDirectory(supabase, userId);
  printWritten(output, accountView, directory.account(id, "id"), contextOf(directory));
}

// An opening balance is in its account's currency, and can be below zero, like a card's debt.
function openingAmount(
  text: string | undefined,
  currency: string,
  directory: Directory,
): number | null {
  if (text === undefined) return null;
  const decimals = directory.decimals(currency);
  return parseAmount(text, "--opening-amount", { code: currency, decimals }, { signed: true });
}

function currencyCode(code: string): string {
  if (!/^[A-Z]{3}$/.test(code)) fail("--currency must be a three-letter code, like USD.");
  return code;
}

const detailOptions = {
  name: { type: "string" },
  currency: { type: "string" },
  color: { type: "string" },
  "opening-amount": { type: "string" },
  "opening-date": { type: "string" },
} satisfies ParseArgsOptionsConfig;
