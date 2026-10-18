import { type Activity, historyOf } from "../activity/activity";
import type { RateHistory } from "../rates/convert";
import { keyOfId, type RowOf, type Rows } from "../sync/copy";
import {
  exclusionsByBudget,
  ledgerAccountsBySpace,
  postingsByLedgerAccount,
  postingsByTransaction,
  ratesByCurrency,
} from "../sync/lookups";

export type SpendingRow = { spent_on: string; currency: string; amount: number };

export function readBudgets({ budgets }: Pick<Rows, "budgets">): RowOf<"budgets">[] {
  return [...budgets.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.created_at.localeCompare(b.created_at),
  );
}

type BudgetRows = Pick<
  Rows,
  "budgets" | "ledger_accounts" | "postings" | "transactions" | "budget_exclusions"
>;

// Refunds come in negative, so this is net spending.
export function readBudgetSpending(rows: BudgetRows, budgetId: string): SpendingRow[] {
  const budget = rows.budgets.get(keyOfId(budgetId));
  if (!budget) return [];

  const excluded = new Set(
    (exclusionsByBudget(rows.budget_exclusions).get(budget.id) ?? []).map(
      ({ transaction_id }) => transaction_id,
    ),
  );
  const postingsOf = postingsByTransaction(rows.postings);
  const postingsOnLedger = postingsByLedgerAccount(rows.postings);

  const totals = new Map<string, SpendingRow>();
  for (const categoryId of countedCategoryIds(budget, rows.ledger_accounts)) {
    for (const posting of postingsOnLedger.get(categoryId) ?? []) {
      const transaction = rows.transactions.get(keyOfId(posting.transaction_id));
      if (!transaction || excluded.has(transaction.id)) continue;
      if (!isWithinDates(budget, transaction.date)) continue;
      if (!isPaidFromListedAccount(budget, postingsOf.get(transaction.id) ?? [])) continue;

      const key = JSON.stringify([transaction.date, posting.currency]);
      const total = totals.get(key) ?? {
        spent_on: transaction.date,
        currency: posting.currency,
        amount: 0,
      };
      total.amount += posting.amount;
      totals.set(key, total);
    }
  }
  return [...totals.values()].sort(
    (a, b) => a.spent_on.localeCompare(b.spent_on) || a.currency.localeCompare(b.currency),
  );
}

function isWithinDates(budget: RowOf<"budgets">, date: string): boolean {
  return date >= budget.starts_on && (budget.ends_on === null || date <= budget.ends_on);
}

// Any posting of the transaction on a listed account.
function isPaidFromListedAccount(
  { account_ids }: RowOf<"budgets">,
  postings: readonly RowOf<"postings">[],
): boolean {
  return (
    account_ids === null ||
    postings.some(({ ledger_account_id }) => account_ids.includes(ledger_account_id))
  );
}

// All of the space's expense categories when the budget names none; otherwise those it names and
// their subcategories.
function countedCategoryIds(budget: RowOf<"budgets">, ledgers: Rows["ledger_accounts"]): string[] {
  const named = budget.category_ids;
  return (ledgerAccountsBySpace(ledgers).get(budget.space_id) ?? [])
    .filter(
      (ledger) =>
        ledger.kind === "expense" &&
        (named === null ||
          named.includes(ledger.id) ||
          (ledger.parent_id !== null && named.includes(ledger.parent_id))),
    )
    .map(({ id }) => id);
}

// Each currency's rates from the one in effect on `firstDay` on, as a day's rate is the latest on
// or before it. A day with no rate before it starts at the first rate after.
export function readRateHistory(
  { exchange_rates }: Pick<Rows, "exchange_rates">,
  currencies: readonly string[],
  firstDay: string | undefined,
): RateHistory {
  if (firstDay === undefined) return new Map();
  const byCurrency = ratesByCurrency(exchange_rates);
  return new Map(
    currencies.map((code) => {
      const dated = byCurrency.get(code) ?? [];
      const inEffect = dated.findLastIndex(({ date }) => date <= firstDay);
      return [code, dated.slice(Math.max(inEffect, 0)).map(({ date, rate }) => ({ date, rate }))];
    }),
  );
}

export function readBudgetHistory(
  { activity }: Pick<Rows, "activity">,
  budgetId: string,
): Activity[] {
  return historyOf(activity, "budgets", budgetId);
}

export function readBudgetExclusions(
  { budget_exclusions }: Pick<Rows, "budget_exclusions">,
  transactionId: string,
): string[] {
  return [...budget_exclusions.values()]
    .filter((exclusion) => exclusion.transaction_id === transactionId)
    .map(({ budget_id }) => budget_id);
}
