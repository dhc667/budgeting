import { randomUUID } from "node:crypto";
import type { ParseArgsOptionsConfig } from "node:util";
import { Constants } from "../../src/supabase/database.types.ts";
import { localToday } from "../../src/format/days.ts";
import type { AppSupabase } from "../../src/supabase/client.ts";
import type { Database } from "../../src/supabase/database.ts";
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
  noPositionals,
  onlyId,
  parseCommand,
  positiveWhole,
  required,
} from "./command.ts";
import {
  type Account,
  type CategoryKind,
  type Directory,
  isIdPrefix,
  loadDirectory,
  shortIdLength,
  signedInDirectory,
} from "./directory.ts";
import { parseAmount } from "./money.ts";
import {
  amountField,
  contextOf,
  idField,
  type Output,
  printDeleted,
  printRow,
  printRows,
  printWritten,
  type View,
  withOutput,
  withQuiet,
} from "./output.ts";

// `account` and `amount` are the side the transaction is recorded from, as the app's form shows
// it: where money left, or where it arrived for a refund, income or money received.
const transactionView: View<Transaction> = {
  fields: [
    idField("id", (t) => t.id),
    { name: "type", json: (t, { directory }) => draftOf(t, directory.categories).type },
    { name: "date", json: (t) => t.date },
    { name: "title", json: (t) => t.title },
    { name: "note", json: (t) => t.note },
    amountField("amount", (t) => ({ minorUnits: t.amount, currency: t.currency })),
    idField("account_id", (t) => t.account_id),
    { name: "account", json: (t, { directory }) => directory.accountName(t.account_id) },
    idField("from_account_id", (t) => t.from_account_id),
    { name: "from_account", json: (t, { directory }) => directory.accountName(t.from_account_id) },
    amountField("from_amount", (t) => ({ minorUnits: t.from_amount, currency: t.from_currency })),
    { name: "from_currency", json: (t) => t.from_currency },
    idField("to_account_id", (t) => t.to_account_id),
    { name: "to_account", json: (t, { directory }) => directory.accountName(t.to_account_id) },
    amountField("to_amount", (t) => ({ minorUnits: t.to_amount, currency: t.to_currency })),
    { name: "to_currency", json: (t) => t.to_currency },
    idField("category_id", (t) => t.category_id),
    { name: "category", json: (t, { directory }) => directory.categoryPath(t.category_id) },
    idField("counterparty_id", (t) => t.counterparty_id),
    {
      name: "counterparty",
      json: (t, { directory }) => directory.counterpartyName(t.counterparty_id),
    },
    amountField("debt_amount", (t) => ({ minorUnits: t.debt_amount, currency: t.debt_currency })),
    { name: "debt_currency", json: (t) => t.debt_currency },
    {
      name: "space_ids",
      json: (t) => t.space_ids,
      text: (t, { shortId }) => t.space_ids.map(shortId).join(", "),
    },
    { name: "one_sided", json: (t) => t.one_sided },
    { name: "created_at", json: (t) => t.created_at },
    { name: "created_by", json: (t) => t.created_by },
  ],
  columns: [
    "id",
    "date",
    "type",
    "amount",
    "account",
    "category",
    "to_account",
    "counterparty",
    "title",
  ],
};

export const transactionCommands: Commands = {
  "transactions list": withOutput(transactionView, listTransactions),
  "transactions show": withOutput(transactionView, showTransaction),
  "transactions add": withOutput(transactionView, addOne, { quiet: true }),
  "transactions update": withOutput(transactionView, changeOne, { quiet: true }),
  "transactions delete": withQuiet(deleteOne),
  "transactions restore": withOutput(transactionView, restoreOne, { quiet: true }),
};

// Newest first, as the app lists them.
async function listTransactions(argv: string[], output: Output) {
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
  const limit = positiveWhole(values.limit, "--limit");
  const { supabase, directory } = await signedInDirectory(values.env);
  const space = values.space === undefined ? undefined : directory.space(values.space, "--space");
  const where = { spaceId: space?.id };
  let query = supabase.from("transaction_details").select(columns);
  if (space) query = query.contains("space_ids", [space.id]);
  if (values.account) {
    const { id } = directory.account(values.account, "--account");
    query = query.or(`from_account_id.eq.${id},to_account_id.eq.${id}`);
  }
  if (values.category) {
    query = query.eq("category_id", directory.category(values.category, "--category", where).id);
  }
  if (values.counterparty) {
    const { id } = directory.counterparty(values.counterparty, "--counterparty", where);
    query = query.eq("counterparty_id", id);
  }
  if (values.from) query = query.gte("date", day(values.from, "--from"));
  if (values.to) query = query.lte("date", day(values.to, "--to"));
  if (values.search) query = query.ilike("search_text", `%${likeEscaped(values.search.trim())}%`);
  const rows = await dataOf(
    query
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit),
  );
  const transactions = rows.map((row) => withAccountSide(row, directory));
  printRows(output, transactionView, transactions, await contextFor(supabase, directory, rows));
}

async function showTransaction(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {});
  const named = onlyId(positionals, "transactions show <transaction>");
  const { supabase, directory } = await signedInDirectory(values.env);
  const row = await transactionNamed(supabase, directory, named);
  printRow(
    output,
    transactionView,
    withAccountSide(row, directory),
    await contextFor(supabase, directory, [row]),
  );
}

async function addOne(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, draftOptions);
  noPositionals(
    positionals,
    "transactions add --type <type> --account <account> --amount <amount> [options]",
  );
  const type = choice(
    required(values.type, "--type"),
    Constants.public.Enums.transaction_type,
    "--type",
  );
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const account = directory.account(required(values.account, "--account"), "--account");
  const draft = draftFrom(values, directory, {
    type,
    date: localToday(),
    title: "",
    note: "",
    account,
    amount: null,
    categoryId: null,
    toAccountId: null,
    toAmount: null,
    counterpartyId: null,
    debtCurrency: null,
    debtAmount: null,
  });
  const id = randomUUID();
  await addTransaction(supabase, id, draft);
  await printTransaction(output, supabase, userId, id);
}

// What isn't given keeps its value. Budget exclusions stay as they are.
async function changeOne(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, draftOptions);
  const named = onlyId(positionals, "transactions update <transaction> [options]");
  const { supabase, userId, directory } = await signedInDirectory(values.env);
  const row = await transactionNamed(supabase, directory, named);
  const current = draftOf(row, directory.categories);
  const draft = draftFrom(values, directory, {
    ...current,
    type:
      values.type === undefined
        ? current.type
        : choice(values.type, Constants.public.Enums.transaction_type, "--type"),
    account:
      values.account === undefined
        ? directory.accountWithId(current.accountId)
        : directory.account(values.account, "--account"),
    amount: current.amount,
  });
  await updateTransaction(supabase, row.id, draft);
  await printTransaction(output, supabase, userId, row.id);
}

// Amounts are in the currency of the account, the other account or the debt they're for, and
// categories and counterparties are looked up in the account's space.
function draftFrom(
  values: DraftValues,
  directory: Directory,
  base: Omit<TransactionDraft, "accountId" | "amount"> & {
    account: Account;
    amount: number | null;
  },
): TransactionDraft {
  const { account, type } = base;
  const inSpace = { spaceId: account.space_id };
  const currencyOf = (code: string) => ({ code, decimals: directory.decimals(code) });
  const toAccount =
    values["to-account"] === undefined
      ? null
      : directory.account(values["to-account"], "--to-account");
  const toAccountId = toAccount?.id ?? base.toAccountId;
  const toAccountCurrency =
    toAccountId === null ? undefined : directory.accountWithId(toAccountId).currency;
  const debtCurrency =
    values["debt-currency"] === undefined ? base.debtCurrency : values["debt-currency"];
  const draft: TransactionDraft = {
    type,
    date: values.date === undefined ? base.date : day(values.date, "--date"),
    title: values.title ?? base.title,
    note: values.note ?? base.note,
    accountId: account.id,
    amount:
      values.amount === undefined
        ? required(base.amount ?? undefined, "--amount")
        : parseAmount(values.amount, "--amount", currencyOf(account.currency)),
    categoryId:
      values.category === undefined
        ? base.categoryId
        : directory.category(values.category, "--category", {
            ...inSpace,
            kind: categoryKindOf(type),
          }).id,
    toAccountId,
    toAmount:
      values["to-amount"] === undefined
        ? base.toAmount
        : parseAmount(
            values["to-amount"],
            "--to-amount",
            currencyOf(required(toAccountCurrency, "--to-account")),
          ),
    counterpartyId:
      values.counterparty === undefined
        ? base.counterpartyId
        : directory.counterparty(values.counterparty, "--counterparty", inSpace).id,
    debtCurrency,
    debtAmount:
      values["debt-amount"] === undefined
        ? base.debtAmount
        : parseAmount(
            values["debt-amount"],
            "--debt-amount",
            currencyOf(required(debtCurrency ?? undefined, "--debt-currency")),
          ),
  };
  // Without a currency of its own, the debt is in the account's, and moves by the amount.
  if (draft.debtAmount !== null && draft.debtCurrency === null) {
    fail("--debt-amount needs --debt-currency.");
  }
  return draft;
}

function categoryKindOf(type: TransactionDraft["type"]): CategoryKind {
  switch (type) {
    case "expense":
    case "refund":
      return "expense";
    case "income":
      return "income";
    case "transfer":
    case "given":
    case "received":
    case "forgave":
    case "forgiven":
      return fail(`A ${type} has no category: --category is for expenses, refunds and income.`);
  }
}

async function deleteOne(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {});
  const named = onlyId(positionals, "transactions delete <transaction>");
  const { supabase, directory } = await signedInDirectory(values.env);
  const row = await transactionNamed(supabase, directory, named);
  const { shortId } = await contextFor(supabase, directory, [row]);
  await deleteTransaction(supabase, row.id);
  printDeleted(output, "transaction", shortId(row.id));
}

async function restoreOne(argv: string[], output: Output) {
  const { values, positionals } = parseCommand(argv, {});
  const named = onlyId(positionals, "transactions restore <transaction>");
  const { supabase, userId } = await signedInDirectory(values.env);
  const id = await deletedTransactionNamed(supabase, named);
  await restoreTransaction(supabase, id);
  await printTransaction(output, supabase, userId, id);
}

async function printTransaction(output: Output, supabase: AppSupabase, userId: string, id: string) {
  const directory = await loadDirectory(supabase, userId);
  const row = await transactionNamed(supabase, directory, id);
  printWritten(
    output,
    transactionView,
    withAccountSide(row, directory),
    await contextFor(supabase, directory, [row]),
  );
}

// A transaction has no name: it goes by its id, or the start of it.
async function transactionNamed(
  supabase: AppSupabase,
  directory: Directory,
  text: string,
): Promise<TransactionRow> {
  const range = idRange(text, "transaction");
  const matches = await dataOf(
    supabase
      .from("transaction_details")
      .select(columns)
      .gte("id", range.from)
      .lte("id", range.to)
      .limit(10),
  );
  const [only, ...others] = matches;
  if (!only) fail(`No transaction ${text} that you can see.`);
  if (others.length > 0) {
    const context = await contextFor(supabase, directory, matches);
    fail(
      `transaction: ${text} could be any of these; give more of its id:\n${matches.map((t) => `  ${context.shortId(t.id)}  ${t.date}  ${t.title ?? ""}`).join("\n")}`,
    );
  }
  return only;
}

// A deleted transaction is gone from every list; the activity record keeps its id.
async function deletedTransactionNamed(supabase: AppSupabase, text: string): Promise<string> {
  const range = idRange(text, "transaction");
  const deletions = await dataOf(
    supabase
      .from("activity")
      .select("row_id")
      .eq("table_name", "transactions")
      .eq("action", "delete")
      .gte("row_id", range.from)
      .lte("row_id", range.to)
      .limit(10),
  );
  const ids = [...new Set(deletions.map(({ row_id }) => row_id))];
  const [only, ...others] = ids;
  if (!only) fail(`No deleted transaction ${text} that you can see.`);
  if (others.length > 0) {
    fail(`transaction: ${text} could be any of these; give more of its id:\n  ${ids.join("\n  ")}`);
  }
  return only;
}

// Every id that starts with the text: uuids compare in their written order.
function idRange(text: string, flag: string): { from: string; to: string } {
  const hex = text.toLowerCase().replaceAll("-", "");
  const from = uuidOf(hex.padEnd(32, "0"));
  if (!isIdPrefix(text) || hex.length > 32 || !from.startsWith(text.toLowerCase())) {
    fail(`${flag}: give its id, or at least its first ${shortIdLength} characters.`);
  }
  return { from, to: uuidOf(hex.padEnd(32, "f")) };
}

function uuidOf(hex: string): string {
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

// A short id is unique among every transaction, not just those shown: only the ones sharing a
// shown one's first characters can make it longer.
async function contextFor(supabase: AppSupabase, directory: Directory, rows: { id: string }[]) {
  const neighbours: string[] = [];
  for (let start = 0; start < rows.length; start += rangesPerRequest) {
    const ranges = rows.slice(start, start + rangesPerRequest).map(({ id }) => {
      const { from, to } = idRange(id.slice(0, shortIdLength), "id");
      return `and(id.gte.${from},id.lte.${to})`;
    });
    const found = await dataOf(supabase.from("transactions").select("id").or(ranges.join(",")));
    neighbours.push(...found.map(({ id }) => id));
  }
  return contextOf(directory, neighbours);
}

function withAccountSide(row: TransactionRow, directory: Directory): Transaction {
  const draft = draftOf(row, directory.categories);
  return {
    ...row,
    account_id: draft.accountId,
    amount: draft.amount,
    currency: directory.accountWithId(draft.accountId).currency,
  };
}

function likeEscaped(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Each range goes in the request's URL, which has to stay within what the server takes.
const rangesPerRequest = 25;

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

type DraftValues = { [Option in keyof typeof draftOptions]?: string };

type TransactionRow = Pick<
  Database["public"]["Views"]["transaction_details"]["Row"],
  | "id"
  | "type"
  | "date"
  | "title"
  | "note"
  | "from_account_id"
  | "from_amount"
  | "from_currency"
  | "to_account_id"
  | "to_amount"
  | "to_currency"
  | "category_id"
  | "counterparty_id"
  | "debt_amount"
  | "debt_currency"
  | "space_ids"
  | "one_sided"
  | "created_at"
  | "created_by"
>;

type Transaction = TransactionRow & {
  account_id: string;
  amount: number;
  currency: string;
};
