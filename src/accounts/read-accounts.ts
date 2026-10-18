import { groupBy } from "../group-by";
import { type Activity, newestFirst } from "../activity/activity";
import type { Json } from "../supabase/database.types";
import { memberOf } from "../supabase/json";
import type { RowOf, Rows } from "../sync/copy";
import type { Account } from "./account-queries";

type AccountRows = Pick<Rows, "ledger_accounts" | "postings" | "transactions">;

export function readAccounts(rows: AccountRows): Account[] {
  const index = indexAccountRows(rows);
  return [...rows.ledger_accounts.values()]
    .filter(({ kind }) => kind === "account")
    .flatMap((ledgerAccount) => {
      const account = accountOf(ledgerAccount, index);
      return account ? [account] : [];
    })
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

// The account's own changes, and those of the transactions that had a posting on it before or
// after the change.
export function readAccountHistory(
  { activity }: Pick<Rows, "activity">,
  accountId: string,
): Activity[] {
  return newestFirst(
    activity,
    (entry) =>
      (entry.table_name === "ledger_accounts" && entry.row_id === accountId) ||
      (entry.table_name === "transactions" &&
        (hasPostingOn(entry.new, accountId) || hasPostingOn(entry.old, accountId))),
  );
}

function hasPostingOn(snapshot: Json | null, accountId: string): boolean {
  const postings = memberOf(snapshot, "postings");
  return (
    Array.isArray(postings) &&
    postings.some((posting) => memberOf(posting, "ledger_account_id") === accountId)
  );
}

type AccountIndex = {
  postingsOf: Map<string, RowOf<"postings">[]>;
  openingTransactionIds: Set<string>;
  dateOf: Map<string, string>;
};

function indexAccountRows({ ledger_accounts, postings, transactions }: AccountRows): AccountIndex {
  const allPostings = [...postings.values()];
  const openingLedgerAccountIds = new Set(
    [...ledger_accounts.values()]
      .filter(({ kind }) => kind === "opening_balance")
      .map(({ id }) => id),
  );
  return {
    postingsOf: groupBy(allPostings, (posting) => posting.ledger_account_id),
    openingTransactionIds: new Set(
      allPostings
        .filter(({ ledger_account_id }) => openingLedgerAccountIds.has(ledger_account_id))
        .map(({ transaction_id }) => transaction_id),
    ),
    dateOf: new Map([...transactions.values()].map(({ id, date }) => [id, date])),
  };
}

function accountOf(
  { id, space_id, name, currency, color, position, archived, created_at }: RowOf<"ledger_accounts">,
  { postingsOf, openingTransactionIds, dateOf }: AccountIndex,
): Account | null {
  if (name === null || currency === null || color === null) return null;
  const own = postingsOf.get(id) ?? [];
  const opening = own.find(({ transaction_id }) => openingTransactionIds.has(transaction_id));
  return {
    id,
    space_id,
    name,
    currency,
    color,
    position,
    archived,
    created_at,
    balance: own.reduce((sum, { amount }) => sum + amount, 0),
    opening_balance: opening?.amount ?? 0,
    opening_date: (opening && dateOf.get(opening.transaction_id)) ?? null,
    has_transactions: own.some(({ transaction_id }) => !openingTransactionIds.has(transaction_id)),
  };
}
