import { newestFirst } from "../spaces/read-spaces";
import type { Activity } from "../spaces/space-queries";
import type { Json } from "../supabase/database.types";
import type { Rows } from "../sync/copy";
import type { Account } from "./account-queries";

type AccountRows = Pick<Rows, "ledger_accounts" | "postings" | "transactions">;

export function readAccounts({ ledger_accounts, postings, transactions }: AccountRows): Account[] {
  const postingsOf = groupBy([...postings.values()], (posting) => posting.ledger_account_id);
  const ledgerAccounts = [...ledger_accounts.values()];
  const openingCategoryOf = new Map(
    ledgerAccounts
      .filter(({ kind }) => kind === "opening_balance")
      .map(({ space_id, id }) => [space_id, id]),
  );
  const openingBalanceCategories = new Set(openingCategoryOf.values());
  const postingsInTransaction = groupBy(
    [...postings.values()],
    (posting) => posting.transaction_id,
  );
  const openingBalances = new Set(
    [...postings.values()]
      .filter(({ ledger_account_id }) => openingBalanceCategories.has(ledger_account_id))
      .map(({ transaction_id }) => transaction_id),
  );
  const dateOf = new Map([...transactions.values()].map(({ id, date }) => [id, date]));

  return ledgerAccounts
    .flatMap((ledgerAccount) => {
      const { id, space_id, name, currency, color, position, archived, created_at } = ledgerAccount;
      if (ledgerAccount.kind !== "account") return [];
      if (name === null || currency === null || color === null) return [];

      const own = postingsOf.get(id) ?? [];
      const openingCategory = openingCategoryOf.get(space_id);
      const opening = own.find(({ transaction_id }) =>
        (postingsInTransaction.get(transaction_id) ?? []).some(
          ({ ledger_account_id }) => ledger_account_id === openingCategory,
        ),
      );
      return [
        {
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
          has_transactions: own.some(({ transaction_id }) => !openingBalances.has(transaction_id)),
        },
      ];
    })
    .sort((a, b) => a.position - b.position || compareText(a.created_at, b.created_at));
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
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) return false;
  const postings = snapshot["postings"];
  return (
    Array.isArray(postings) &&
    postings.some(
      (posting) =>
        typeof posting === "object" &&
        posting !== null &&
        !Array.isArray(posting) &&
        posting["ledger_account_id"] === accountId,
    )
  );
}

function groupBy<Item>(items: Item[], keyOf: (item: Item) => string): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
