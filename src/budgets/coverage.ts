import type { Account } from "../accounts/account-queries";
import type { Category } from "../categories/category-queries";
import type { Budget } from "./budget-queries";

// The budgets an expense or refund counts toward, as `readBudgetSpending` counts it: one of its
// categories or their subcategories, from one of its accounts, within its dates.
export function budgetsCounting(
  budgets: Budget[],
  { account, category, date }: { account: Account; category: Category; date: string },
): Budget[] {
  return budgets.filter(
    (budget) =>
      budget.space_id === account.space_id &&
      category.kind === "expense" &&
      covers(budget.category_ids, category.id, category.parent_id) &&
      covers(budget.account_ids, account.id) &&
      date >= budget.starts_on &&
      (budget.ends_on === null || date <= budget.ends_on),
  );
}

// Null covers every one.
function covers(chosen: string[] | null, ...ids: (string | null)[]): boolean {
  return chosen === null || ids.some((id) => id !== null && chosen.includes(id));
}
