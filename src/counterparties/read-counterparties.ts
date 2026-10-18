import type { Color } from "../colors/colors";
import { groupBy } from "../group-by";
import { keyOfId, type RowOf, type Rows } from "../sync/copy";
import { postingsByLedgerAccount } from "../sync/lookups";

export function readCounterparties({
  ledger_accounts,
  postings,
}: Pick<Rows, "ledger_accounts" | "postings">): Counterparty[] {
  const postingsOf = postingsByLedgerAccount(postings);
  const categorized = transactionsWithCategories(ledger_accounts, postings);
  return [...ledger_accounts.values()]
    .flatMap(({ id, space_id, kind, name, color, created_at }) => {
      if (kind !== "counterparty" || name === null || color === null) return [];
      const own = postingsOf.get(id) ?? [];
      return [
        {
          id,
          space_id,
          name,
          color,
          created_at,
          balances: balancesOf(own, categorized),
          has_transactions: own.length > 0,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function transactionsWithCategories(
  ledgers: Rows["ledger_accounts"],
  postings: Rows["postings"],
): Set<string> {
  const ids = new Set<string>();
  for (const posting of postings.values()) {
    const kind = ledgers.get(keyOfId(posting.ledger_account_id))?.kind;
    if (kind === "expense" || kind === "income") ids.add(posting.transaction_id);
  }
  return ids;
}

// Money given to a counterparty posts into it, and money received from it posts out. So does a
// debt forgiven either way, without money moving: only a forgiven debt has both a counterparty and a
// category.
function balancesOf(
  postings: readonly RowOf<"postings">[],
  categorized: Set<string>,
): CounterpartyBalance[] {
  return [...groupBy(postings, ({ currency }) => currency)]
    .map(([currency, inCurrency]) => {
      const moved = inCurrency.filter(({ transaction_id }) => !categorized.has(transaction_id));
      const given = sum(moved.filter(({ amount }) => amount > 0));
      const received = -sum(moved.filter(({ amount }) => amount < 0));
      const forgiven = inCurrency
        .filter(({ transaction_id }) => categorized.has(transaction_id))
        .reduce((total, { amount }) => total + Math.abs(amount), 0);
      return { currency, given, received, forgiven, owed: sum(inCurrency) };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function sum(postings: readonly RowOf<"postings">[]): number {
  return postings.reduce((total, { amount }) => total + amount, 0);
}

export type Counterparty = {
  id: string;
  space_id: string;
  name: string;
  color: Color;
  created_at: string;
  balances: CounterpartyBalance[];
  has_transactions: boolean;
};

// In minor units of the currency. Above zero, the counterparty owes the space; below, the space
// owes the counterparty. Money given and received leaves out debts forgiven, either way.
export type CounterpartyBalance = {
  currency: string;
  given: number;
  received: number;
  forgiven: number;
  owed: number;
};
