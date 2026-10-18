import type { Activity } from "../activity/activity";
import type { Json } from "../supabase/database.types";
import { memberOf } from "../supabase/json";
import { keyOfId, type RowOf, type Rows } from "../sync/copy";
import type {
  TitleSuggestion,
  Transaction,
  TransactionFilter,
  TransactionType,
} from "./transaction-queries";

type TransactionRows = Pick<Rows, "transactions" | "postings" | "ledger_accounts">;

type Seen = { posting: RowOf<"postings">; ledger: RowOf<"ledger_accounts"> };

export function readTransactions(rows: TransactionRows, filter: TransactionFilter): Transaction[] {
  return allDetails(rows)
    .filter((transaction) => matches(transaction, filter))
    .sort(newestFirst);
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
  const postings = [...rows.postings.values()].filter(
    ({ transaction_id }) => transaction_id === id,
  );
  return detailsOf(transaction, postings, rows.ledger_accounts);
}

// A transaction's activity is logged once in each space it touched; those entries are one change.
export function readTransactionHistory(
  { activity }: Pick<Rows, "activity">,
  transactionId: string,
): Activity[] {
  const changes = new Map<string, RowOf<"activity">[]>();
  for (const entry of activity.values()) {
    if (entry.table_name !== "transactions" || entry.row_id !== transactionId) continue;
    const key = JSON.stringify([entry.action, entry.changed_by, entry.changed_at]);
    changes.set(key, [...(changes.get(key) ?? []), entry]);
  }
  return [...changes.values()]
    .flatMap((entries) => {
      const [first, ...rest] = entries.sort((a, b) => a.id - b.id);
      if (!first) return [];
      const { id, table_name, row_id, action, changed_by, changed_at } = first;
      const sides = [first, ...rest];
      return [
        {
          id,
          table_name,
          row_id,
          action,
          changed_by,
          changed_at,
          old: mergedSnapshot(sides.map((side) => side.old)),
          new: mergedSnapshot(sides.map((side) => side.new)),
        },
      ];
    })
    .sort((a, b) => b.id - a.id);
}

// The user's latest transaction of each title, per category and which way its money went, or per
// pair of accounts for a transfer.
export function readTitleSuggestions(rows: TransactionRows, userId: string): TitleSuggestion[] {
  const latest = new Map<string, TitleSuggestion>();
  for (const transaction of allDetails(rows).sort(newestFirst)) {
    const { title, type } = transaction;
    if (transaction.created_by !== userId || title === null || type === null) continue;
    if (transaction.one_sided) continue;
    const key = JSON.stringify([
      title.toLowerCase(),
      transaction.category_id,
      type === "expense",
      transaction.category_id === null ? transaction.from_account_id : null,
      transaction.category_id === null ? transaction.to_account_id : null,
    ]);
    if (!latest.has(key)) latest.set(key, { ...transaction, title, type });
  }
  return [...latest.values()];
}

function allDetails({ transactions, postings, ledger_accounts }: TransactionRows): Transaction[] {
  const postingsOf = new Map<string, RowOf<"postings">[]>();
  for (const posting of postings.values()) {
    postingsOf.set(posting.transaction_id, [
      ...(postingsOf.get(posting.transaction_id) ?? []),
      posting,
    ]);
  }
  return [...transactions.values()].flatMap((transaction) => {
    const details = detailsOf(transaction, postingsOf.get(transaction.id) ?? [], ledger_accounts);
    return details ? [details] : [];
  });
}

// Null for an opening balance. Only the postings the user can see are here, which is all of a
// transaction in their spaces and one side of a transfer from a space they are not in.
function detailsOf(
  transaction: RowOf<"transactions">,
  postings: RowOf<"postings">[],
  ledgers: Rows["ledger_accounts"],
): Transaction | null {
  const seen = postings.flatMap((posting) => {
    const ledger = ledgers.get(keyOfId(posting.ledger_account_id));
    return ledger ? [{ posting, ledger }] : [];
  });
  if (seen.some(({ ledger }) => ledger.kind === "opening_balance")) return null;

  const sent = seen.find(({ ledger, posting }) => ledger.kind === "account" && posting.amount < 0);
  const received = seen.find(
    ({ ledger, posting }) => ledger.kind === "account" && posting.amount > 0,
  );
  const category = seen.find(({ ledger }) => ledger.kind === "expense" || ledger.kind === "income");
  const { id, date, title, note, created_by, created_at } = transaction;
  return {
    id,
    date,
    title,
    note,
    created_by,
    created_at,
    type: typeOf(seen),
    one_sided: seen.length < 2,
    from_account_id: sent?.posting.ledger_account_id ?? null,
    from_amount: sent ? -sent.posting.amount : null,
    from_currency: sent?.posting.currency ?? null,
    to_account_id: received?.posting.ledger_account_id ?? null,
    to_amount: received?.posting.amount ?? null,
    to_currency: received?.posting.currency ?? null,
    category_id: category?.posting.ledger_account_id ?? null,
    space_ids: [...new Set(seen.map(({ ledger }) => ledger.space_id))],
    search_text: withoutAccents([title, note].filter((text) => text !== null).join("\n")),
  };
}

// A single visible posting on a money account is one side of a transfer: an expense, refund or
// income stays within one space (ADR 0007), so its other side is in a space the user is not in.
function typeOf(seen: Seen[]): TransactionType | null {
  const [only] = seen;
  if (seen.length === 1) return only?.ledger.kind === "account" ? "transfer" : null;
  if (seen.length !== 2) return null;
  const money = seen.filter(({ ledger }) => ledger.kind === "account");
  const other = seen.find(({ ledger }) => ledger.kind !== "account");
  if (money.length === 2) return "transfer";
  const [account] = money;
  if (money.length !== 1 || !account || !other) return null;
  const { amount } = account.posting;
  switch (other.ledger.kind) {
    case "expense":
      return amount < 0 ? "expense" : "refund";
    case "income":
      return amount > 0 ? "income" : null;
    case "account":
    case "opening_balance":
      return null;
  }
}

function matches(transaction: Transaction, filter: TransactionFilter): boolean {
  const { spaceIds, accountIds, categoryIds, from, to, search } = filter;
  const { from_account_id, to_account_id, category_id } = transaction;
  return (
    (!spaceIds || transaction.space_ids.some((id) => spaceIds.includes(id))) &&
    (!accountIds ||
      (from_account_id !== null && accountIds.includes(from_account_id)) ||
      (to_account_id !== null && accountIds.includes(to_account_id))) &&
    (!categoryIds || (category_id !== null && categoryIds.includes(category_id))) &&
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
