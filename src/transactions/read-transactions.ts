import { type Activity, newestEntriesFirst } from "../activity/activity";
import { groupBy } from "../group-by";
import type { Json } from "../supabase/database.types";
import { memberOf } from "../supabase/json";
import { keyOfId, type RowOf, type Rows } from "../sync/copy";
import { postingsByTransaction } from "../sync/lookups";
import type {
  DayFlow,
  ListDay,
  TitleSuggestion,
  Transaction,
  TransactionFilter,
  TransactionPage,
} from "./transaction-queries";
import type { TransactionType } from "./transaction-writes";

type TransactionRows = Pick<Rows, "transactions" | "postings" | "ledger_accounts">;

type VisiblePosting = { posting: RowOf<"postings">; ledger: RowOf<"ledger_accounts"> };

export function readTransactions(rows: TransactionRows, filter: TransactionFilter): Transaction[] {
  return readAllTransactions(rows)
    .filter((transaction) => matches(transaction, filter))
    .sort(newestFirst);
}

// The first `count` matches, and each day they reach counted and totalled over all its matches, so a
// day the page cuts short still shows its whole total.
export function readTransactionPage(
  rows: TransactionRows,
  filter: TransactionFilter,
  count: number,
): TransactionPage {
  const matching = readTransactions(rows, filter);
  const transactions = matching.slice(0, count);
  const shownDays = new Set(transactions.map(({ date }) => date));
  return {
    transactions,
    hasMore: matching.length > count,
    days: listDays(matching.filter(({ date }) => shownDays.has(date))),
  };
}

export function readRecentTransactions(
  rows: TransactionRows,
  spaceIds: string[],
  count: number,
): Transaction[] {
  return readTransactions(rows, { spaceIds }).slice(0, count);
}

export function readTransaction(rows: TransactionRows, id: string): Transaction | null {
  const transaction = rows.transactions.get(keyOfId(id));
  if (!transaction) return null;
  return transactionOf(
    transaction,
    postingsByTransaction(rows.postings).get(id) ?? [],
    rows.ledger_accounts,
  );
}

// A transaction's activity is logged once in each space it touched; those entries are one change.
export function readTransactionHistory(
  { activity }: Pick<Rows, "activity">,
  transactionId: string,
): Activity[] {
  const entries = [...activity.values()].filter(
    (entry) => entry.table_name === "transactions" && entry.row_id === transactionId,
  );
  const changes = groupBy(entries, (entry) =>
    JSON.stringify([entry.action, entry.changed_by, entry.changed_at]),
  );
  return newestEntriesFirst(
    [...changes.values()].flatMap((sides) => {
      const [first] = sides.sort((a, b) => a.id - b.id);
      if (!first) return [];
      return [
        {
          ...first,
          old: mergedSnapshot(sides.map((side) => side.old)),
          new: mergedSnapshot(sides.map((side) => side.new)),
        },
      ];
    }),
  );
}

// The user's latest transaction of each title, per type and category or counterparty, or per pair
// of accounts for a transfer.
export function readTitleSuggestions(rows: TransactionRows, userId: string): TitleSuggestion[] {
  const latest = new Map<string, TitleSuggestion>();
  for (const transaction of readAllTransactions(rows).sort(newestFirst)) {
    const { title, type } = transaction;
    if (transaction.created_by !== userId || title === null || type === null) continue;
    if (transaction.one_sided) continue;
    const isTransfer = type === "transfer";
    const key = JSON.stringify({
      title: title.toLowerCase(),
      type,
      categoryId: transaction.category_id,
      counterpartyId: transaction.counterparty_id,
      fromAccountId: isTransfer ? transaction.from_account_id : null,
      toAccountId: isTransfer ? transaction.to_account_id : null,
    });
    if (!latest.has(key)) latest.set(key, { ...transaction, title, type });
  }
  return [...latest.values()];
}

function listDays(transactions: Transaction[]): ListDay[] {
  const days = new Map<string, ListDay>();
  for (const transaction of transactions) {
    const day = days.get(transaction.date) ?? { day: transaction.date, count: 0, flows: [] };
    days.set(transaction.date, day);
    day.count++;
    const flow = earnedOrSpent(transaction);
    if (!flow) continue;
    const sameCurrency = day.flows.find(({ currency }) => currency === flow.currency);
    if (sameCurrency) sameCurrency.net += flow.net;
    else day.flows.push(flow);
  }
  return [...days.values()];
}

// Transfers and debts move money without earning or spending it. A forgiven debt is, as in reports.
function earnedOrSpent(transaction: Transaction): DayFlow | null {
  const { type, from_amount, from_currency, to_amount, to_currency } = transaction;
  switch (type) {
    case "expense":
    case "forgave":
      return from_amount !== null && from_currency !== null
        ? { currency: from_currency, net: -from_amount }
        : null;
    case "income":
    case "refund":
    case "forgiven":
      return to_amount !== null && to_currency !== null
        ? { currency: to_currency, net: to_amount }
        : null;
    case "transfer":
    case "given":
    case "received":
    case null:
      return null;
  }
}

function readAllTransactions({
  transactions,
  postings,
  ledger_accounts,
}: TransactionRows): Transaction[] {
  const postingsOf = postingsByTransaction(postings);
  return [...transactions.values()].flatMap((transaction) => {
    const details = transactionOf(
      transaction,
      postingsOf.get(transaction.id) ?? [],
      ledger_accounts,
    );
    return details ? [details] : [];
  });
}

// Null for an opening balance. A transfer from a space the user is not in has only its visible side.
function transactionOf(
  transaction: RowOf<"transactions">,
  postings: readonly RowOf<"postings">[],
  ledgers: Rows["ledger_accounts"],
): Transaction | null {
  const visible = postings.flatMap((posting) => {
    const ledger = ledgers.get(keyOfId(posting.ledger_account_id));
    return ledger ? [{ posting, ledger }] : [];
  });
  if (visible.some(({ ledger }) => ledger.kind === "opening_balance")) return null;

  const sent = visible.find(
    ({ ledger, posting }) => ledger.kind === "account" && posting.amount < 0,
  );
  const received = visible.find(
    ({ ledger, posting }) => ledger.kind === "account" && posting.amount > 0,
  );
  const category = visible.find(
    ({ ledger }) => ledger.kind === "expense" || ledger.kind === "income",
  );
  const counterparty = visible.find(({ ledger }) => ledger.kind === "counterparty");
  const { id, date, title, note, created_by, created_at } = transaction;
  return {
    id,
    date,
    title,
    note,
    created_by,
    created_at,
    type: typeOf(visible.length, { sent, received, category, counterparty }),
    one_sided: visible.length < 2,
    from_account_id: sent?.posting.ledger_account_id ?? null,
    from_amount: sent ? -sent.posting.amount : null,
    from_currency: sent?.posting.currency ?? null,
    to_account_id: received?.posting.ledger_account_id ?? null,
    to_amount: received?.posting.amount ?? null,
    to_currency: received?.posting.currency ?? null,
    category_id: category?.posting.ledger_account_id ?? null,
    space_ids: [...new Set(visible.map(({ ledger }) => ledger.space_id))],
    search_text: withoutAccents([title, note].filter((text) => text !== null).join("\n")),
    counterparty_id: counterparty?.posting.ledger_account_id ?? null,
  };
}

// A single visible posting on a money account is one side of a transfer: an expense, refund or
// income, or money given or received, stays within one space (ADR 0007), so its other side is in
// a space the user is not in. A forgiven debt passes through its account: in from the counterparty
// and out to a category, or the other way round.
function typeOf(
  visibleCount: number,
  sides: {
    sent: VisiblePosting | undefined;
    received: VisiblePosting | undefined;
    category: VisiblePosting | undefined;
    counterparty: VisiblePosting | undefined;
  },
): TransactionType | null {
  const { sent, received, category, counterparty } = sides;
  if (visibleCount === 1) return sent || received ? "transfer" : null;
  if (visibleCount === 4) {
    if (!sent || !received || !counterparty) return null;
    if (category?.ledger.kind === "expense") return "forgave";
    if (category?.ledger.kind === "income") return "forgiven";
    return null;
  }
  if (visibleCount !== 2) return null;
  const otherSide = category ?? counterparty;
  if (sent && received) return "transfer";
  if (!otherSide || !(sent || received)) return null;
  switch (otherSide.ledger.kind) {
    case "expense":
      return sent ? "expense" : "refund";
    case "income":
      return received ? "income" : null;
    case "counterparty":
      return sent ? "given" : "received";
    case "account":
    case "opening_balance":
      return null;
  }
}

function matches(transaction: Transaction, filter: TransactionFilter): boolean {
  const { spaceIds, accountIds, categoryIds, counterpartyIds, from, to, search } = filter;
  const { from_account_id, to_account_id, category_id, counterparty_id } = transaction;
  return (
    (!spaceIds || transaction.space_ids.some((id) => spaceIds.includes(id))) &&
    (!accountIds ||
      (from_account_id !== null && accountIds.includes(from_account_id)) ||
      (to_account_id !== null && accountIds.includes(to_account_id))) &&
    (!categoryIds || (category_id !== null && categoryIds.includes(category_id))) &&
    (!counterpartyIds || (counterparty_id !== null && counterpartyIds.includes(counterparty_id))) &&
    (!from || transaction.date >= from) &&
    (!to || transaction.date <= to) &&
    (!search ||
      transaction.search_text.toLowerCase().includes(withoutAccents(search.trim()).toLowerCase()))
  );
}

function newestFirst(a: Transaction, b: Transaction): number {
  return (
    b.date.localeCompare(a.date) ||
    b.created_at.localeCompare(a.created_at) ||
    b.id.localeCompare(a.id)
  );
}

function withoutAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

// One side of a change is a space's snapshot; a member of only one of the spaces has just that.
function mergedSnapshot(snapshots: (Json | null)[]): Json | null {
  const present = snapshots.filter((snapshot) => snapshot !== null);
  const [first, ...others] = present;
  if (first === undefined) return null;
  if (others.length === 0) return first;
  const postings = present
    .flatMap((snapshot) => {
      const own = memberOf(snapshot, "postings");
      return Array.isArray(own) ? own : [];
    })
    .sort((a, b) => amountOf(b) - amountOf(a));
  return {
    ...withoutOtherSpace(first),
    postings: postings.length > 0 ? postings : null,
  };
}

function withoutOtherSpace(snapshot: Json): Record<string, Json | undefined> {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) return {};
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "other_space"));
}

function amountOf(posting: Json | undefined): number {
  const amount = memberOf(posting, "amount");
  return typeof amount === "number" ? amount : 0;
}
