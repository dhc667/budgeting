import { randomUUID } from "node:crypto";
import type { ParseArgsOptionsConfig } from "node:util";
import { Constants } from "../../src/supabase/database.types.ts";
import { localToday } from "../../src/format/days.ts";
import type { AppSupabase } from "../../src/supabase/client.ts";
import {
  addTransaction,
  deleteTransaction,
  draftOf,
  restoreTransaction,
  type TransactionDraft,
  updateTransaction,
} from "../../src/transactions/transaction-writes.ts";
import { fail } from "../fail.ts";
import {
  choice,
  type Commands,
  dataOf,
  day,
  minorUnits,
  noPositionals,
  onlyId,
  parseCommand,
  print,
  required,
  uuid,
} from "./command.ts";
import { signedIn } from "./session.ts";

export const transactionCommands: Commands = {
  "transactions list": listTransactions,
  "transactions show": showTransaction,
  "transactions add": addOne,
  "transactions update": changeOne,
  "transactions delete": deleteOne,
  "transactions restore": restoreOne,
};

// Newest first, as the app lists them.
async function listTransactions(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {
    space: { type: "string" },
    account: { type: "string" },
    category: { type: "string" },
    counterparty: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    search: { type: "string" },
    limit: { type: "string", default: "50" },
  });
  noPositionals(positionals, "transactions list [filters]");
  const limit = minorUnits(values.limit, "--limit");
  const { supabase } = await signedIn(values.env);
  let query = supabase.from("transaction_details").select(columns);
  if (values.space) query = query.contains("space_ids", [values.space]);
  if (values.account) {
    const id = uuid(values.account, "--account");
    query = query.or(`from_account_id.eq.${id},to_account_id.eq.${id}`);
  }
  if (values.category) query = query.eq("category_id", values.category);
  if (values.counterparty) query = query.eq("counterparty_id", values.counterparty);
  if (values.from) query = query.gte("date", day(values.from, "--from"));
  if (values.to) query = query.lte("date", day(values.to, "--to"));
  if (values.search) query = query.ilike("search_text", `%${likeEscaped(values.search.trim())}%`);
  print(
    await dataOf(
      query
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
    ),
  );
}

async function showTransaction(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {});
  const id = onlyId(positionals, "transactions show <id>");
  const { supabase } = await signedIn(values.env);
  print(await transaction(supabase, id));
}

async function addOne(argv: string[]) {
  const { values, positionals } = parseCommand(argv, draftOptions);
  noPositionals(
    positionals,
    "transactions add --type <type> --account <id> --amount <n> [options]",
  );
  const draft: TransactionDraft = {
    type: choice(
      required(values.type, "--type"),
      Constants.public.Enums.transaction_type,
      "--type",
    ),
    date: values.date === undefined ? localToday() : day(values.date, "--date"),
    title: values.title ?? "",
    note: values.note ?? "",
    accountId: required(values.account, "--account"),
    amount: minorUnits(required(values.amount, "--amount"), "--amount"),
    categoryId: values.category ?? null,
    toAccountId: values["to-account"] ?? null,
    toAmount:
      values["to-amount"] === undefined ? null : minorUnits(values["to-amount"], "--to-amount"),
    counterpartyId: values.counterparty ?? null,
    debtCurrency: values["debt-currency"] ?? null,
    debtAmount:
      values["debt-amount"] === undefined
        ? null
        : minorUnits(values["debt-amount"], "--debt-amount"),
  };
  checkDebt(draft);
  const { supabase } = await signedIn(values.env);
  const id = randomUUID();
  await addTransaction(supabase, id, draft);
  print(await transaction(supabase, id));
}

// What isn't given keeps its value. Budget exclusions stay as they are.
async function changeOne(argv: string[]) {
  const { values, positionals } = parseCommand(argv, draftOptions);
  const id = onlyId(positionals, "transactions update <id> [options]");
  const { supabase } = await signedIn(values.env);
  const current = draftOf(await transaction(supabase, id), await categoriesOf(supabase));
  const draft: TransactionDraft = {
    type:
      values.type === undefined
        ? current.type
        : choice(values.type, Constants.public.Enums.transaction_type, "--type"),
    date: values.date === undefined ? current.date : day(values.date, "--date"),
    title: values.title ?? current.title,
    note: values.note ?? current.note,
    accountId: values.account ?? current.accountId,
    amount: values.amount === undefined ? current.amount : minorUnits(values.amount, "--amount"),
    categoryId: values.category ?? current.categoryId,
    toAccountId: values["to-account"] ?? current.toAccountId,
    toAmount:
      values["to-amount"] === undefined
        ? current.toAmount
        : minorUnits(values["to-amount"], "--to-amount"),
    counterpartyId: values.counterparty ?? current.counterpartyId,
    debtCurrency: values["debt-currency"] ?? current.debtCurrency,
    debtAmount:
      values["debt-amount"] === undefined
        ? current.debtAmount
        : minorUnits(values["debt-amount"], "--debt-amount"),
  };
  checkDebt(draft);
  await updateTransaction(supabase, id, draft);
  print(await transaction(supabase, id));
}

// Without a currency of its own, the debt is in the account's, and moves by the amount.
function checkDebt({ debtCurrency, debtAmount }: TransactionDraft) {
  if (debtAmount !== null && debtCurrency === null) fail("--debt-amount needs --debt-currency.");
}

async function deleteOne(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {});
  const id = onlyId(positionals, "transactions delete <id>");
  const { supabase } = await signedIn(values.env);
  await deleteTransaction(supabase, id);
  print({ deleted: id });
}

async function restoreOne(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {});
  const id = onlyId(positionals, "transactions restore <id>");
  const { supabase } = await signedIn(values.env);
  await restoreTransaction(supabase, id);
  print(await transaction(supabase, id));
}

async function transaction(supabase: AppSupabase, id: string) {
  const found = await dataOf(
    supabase.from("transaction_details").select(columns).eq("id", id).maybeSingle(),
  );
  if (!found) fail(`No transaction ${id} that you can see.`);
  return found;
}

// draftOf needs them for a transaction whose category changed kind since it was recorded.
async function categoriesOf(supabase: AppSupabase) {
  return dataOf(supabase.from("categories").select("id, kind"));
}

function likeEscaped(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const columns =
  "id, type, date, title, note, from_account_id, from_amount, from_currency, to_account_id, to_amount, to_currency, category_id, counterparty_id, debt_amount, debt_currency, space_ids, one_sided, created_at, created_by";

const draftOptions = {
  type: { type: "string" },
  date: { type: "string" },
  title: { type: "string" },
  note: { type: "string" },
  account: { type: "string" },
  amount: { type: "string" },
  category: { type: "string" },
  "to-account": { type: "string" },
  "to-amount": { type: "string" },
  counterparty: { type: "string" },
  "debt-currency": { type: "string" },
  "debt-amount": { type: "string" },
} satisfies ParseArgsOptionsConfig;
