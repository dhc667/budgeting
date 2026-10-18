import type { Color } from "../colors/colors";
import { groupBy } from "../group-by";
import type { RowOf, Rows } from "../sync/copy";
import { postingsByLedgerAccount } from "../sync/lookups";

export function readCounterparties({
  ledger_accounts,
  postings,
}: Pick<Rows, "ledger_accounts" | "postings">): Counterparty[] {
  const postingsOf = postingsByLedgerAccount(postings);
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
          balances: balancesOf(own),
          has_transactions: own.length > 0,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Money given to a counterparty posts into it, and money received from it posts out.
function balancesOf(postings: readonly RowOf<"postings">[]): CounterpartyBalance[] {
  return [...groupBy(postings, ({ currency }) => currency)]
    .map(([currency, inCurrency]) => {
      const given = sum(inCurrency.filter(({ amount }) => amount > 0));
      const received = -sum(inCurrency.filter(({ amount }) => amount < 0));
      return { currency, given, received, owed: given - received };
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
// owes the counterparty.
export type CounterpartyBalance = {
  currency: string;
  given: number;
  received: number;
  owed: number;
};
