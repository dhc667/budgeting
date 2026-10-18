import { groupBy } from "../group-by";
import type { RowOf, Rows } from "./copy";

// Each derivation is worked out once per table object. A pull leaves the tables it didn't touch
// as they were, so what was derived from them carries over to the next copy.
function perTable<Table extends object, Result>(
  derive: (table: Table) => Result,
): (table: Table) => Result {
  const derived = new WeakMap<Table, Result>();
  return (table) => {
    const known = derived.get(table);
    if (known !== undefined) return known;
    const result = derive(table);
    derived.set(table, result);
    return result;
  };
}

export const postingsByTransaction = perTable(
  (postings: Rows["postings"]): ReadonlyMap<string, readonly RowOf<"postings">[]> =>
    groupBy(postings.values(), ({ transaction_id }) => transaction_id),
);

export const postingsByLedgerAccount = perTable(
  (postings: Rows["postings"]): ReadonlyMap<string, readonly RowOf<"postings">[]> =>
    groupBy(postings.values(), ({ ledger_account_id }) => ledger_account_id),
);

export const ledgerAccountsBySpace = perTable(
  (ledgers: Rows["ledger_accounts"]): ReadonlyMap<string, readonly RowOf<"ledger_accounts">[]> =>
    groupBy(ledgers.values(), ({ space_id }) => space_id),
);

export const exclusionsByBudget = perTable(
  (
    exclusions: Rows["budget_exclusions"],
  ): ReadonlyMap<string, readonly RowOf<"budget_exclusions">[]> =>
    groupBy(exclusions.values(), ({ budget_id }) => budget_id),
);

export const ratesByCurrency = perTable(
  (rates: Rows["exchange_rates"]): ReadonlyMap<string, readonly RowOf<"exchange_rates">[]> => {
    const byCurrency = groupBy(rates.values(), ({ currency }) => currency);
    for (const each of byCurrency.values()) each.sort((a, b) => a.date.localeCompare(b.date));
    return byCurrency;
  },
);
