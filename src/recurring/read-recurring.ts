import { type Activity, historyOf } from "../activity/activity";
import type { RowOf, Rows } from "../sync/copy";

export function readRecurringTransactions({
  recurring_transactions,
}: Pick<Rows, "recurring_transactions">): RowOf<"recurring_transactions">[] {
  return [...recurring_transactions.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}

export function readRecurringHistory(
  { activity }: Pick<Rows, "activity">,
  ruleId: string,
): Activity[] {
  return historyOf(activity, "recurring_transactions", ruleId);
}
