import { type Activity, newestFirst } from "../activity/activity";
import { groupBy } from "../group-by";
import type { RateHistory } from "../rates/convert";
import type { RowOf, Rows } from "../sync/copy";

export type SpendingRow = { spent_on: string; currency: string; amount: number };

export function readBudgets({ budgets }: Pick<Rows, "budgets">): RowOf<"budgets">[] {
  return [...budgets.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.created_at.localeCompare(b.created_at),
  );
}

// Refunds come in negative, so this is net spending.
export function readBudgetSpending(
  rows: Pick<
    Rows,
    "budgets" | "ledger_accounts" | "postings" | "transactions" | "budget_exclusions"
  >,
  budgetId: string,
): SpendingRow[] {
  const budget = [...rows.budgets.values()].find(({ id }) => id === budgetId);
  if (!budget) return [];

  const categoryIds = categoriesOf(budget, rows.ledger_accounts);
  const excluded = new Set(
    [...rows.budget_exclusions.values()]
      .filter((exclusion) => exclusion.budget_id === budget.id)
      .map(({ transaction_id }) => transaction_id),
  );
  const postings = [...rows.postings.values()];
  const postingsOf = groupBy(postings, (posting) => posting.transaction_id);
  const paidFrom = budget.account_ids;

  const totals = new Map<string, SpendingRow>();
  for (const posting of postings) {
    if (!categoryIds.has(posting.ledger_account_id)) continue;
    const transaction = rows.transactions.get(JSON.stringify([posting.transaction_id]));
    if (!transaction || excluded.has(transaction.id)) continue;
    if (transaction.date < budget.starts_on) continue;
    if (budget.ends_on !== null && transaction.date > budget.ends_on) continue;
    if (
      paidFrom !== null &&
      !(postingsOf.get(transaction.id) ?? []).some(({ ledger_account_id }) =>
        paidFrom.includes(ledger_account_id),
      )
    ) {
      continue;
    }

    const key = JSON.stringify([transaction.date, posting.currency]);
    const total = totals.get(key) ?? {
      spent_on: transaction.date,
      currency: posting.currency,
      amount: 0,
    };
    total.amount += posting.amount;
    totals.set(key, total);
  }
  return [...totals.values()].sort(
    (a, b) => a.spent_on.localeCompare(b.spent_on) || a.currency.localeCompare(b.currency),
  );
}

// All of the space's expense categories when the budget names none; otherwise those it names and
// their subcategories.
function categoriesOf(budget: RowOf<"budgets">, ledgers: Rows["ledger_accounts"]): Set<string> {
  const named = budget.category_ids;
  return new Set(
    [...ledgers.values()]
      .filter(
        (ledger) =>
          ledger.space_id === budget.space_id &&
          ledger.kind === "expense" &&
          (named === null ||
            named.includes(ledger.id) ||
            (ledger.parent_id !== null && named.includes(ledger.parent_id))),
      )
      .map(({ id }) => id),
  );
}

// Each currency's rates from the one in effect on `firstDay` on, as a day's rate is the latest on
// or before it. A day with no rate before it starts at the first rate after.
export function readRateHistory(
  { exchange_rates }: Pick<Rows, "exchange_rates">,
  currencies: readonly string[],
  firstDay: string | undefined,
): RateHistory {
  if (firstDay === undefined) return new Map();
  const wanted = new Set(currencies);
  const byCurrency = groupBy(
    [...exchange_rates.values()].filter(({ currency }) => wanted.has(currency)),
    ({ currency }) => currency,
  );
  return new Map(
    currencies.map((code) => {
      const dated = (byCurrency.get(code) ?? [])
        .map(({ date, rate }) => ({ date, rate }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const inEffect = dated.findLast(({ date }) => date <= firstDay)?.date ?? firstDay;
      return [code, dated.filter(({ date }) => date >= inEffect)];
    }),
  );
}

export function readBudgetHistory(
  { activity }: Pick<Rows, "activity">,
  budgetId: string,
): Activity[] {
  return newestFirst(
    activity,
    ({ table_name, row_id }) => table_name === "budgets" && row_id === budgetId,
  );
}

export function readBudgetExclusions(
  { budget_exclusions }: Pick<Rows, "budget_exclusions">,
  transactionId: string,
): string[] {
  return [...budget_exclusions.values()]
    .filter((exclusion) => exclusion.transaction_id === transactionId)
    .map(({ budget_id }) => budget_id);
}
