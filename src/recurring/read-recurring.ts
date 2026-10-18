import { type Activity, newestFirst } from "../activity/activity";
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
  return newestFirst(
    activity,
    ({ table_name, row_id }) => table_name === "recurring_transactions" && row_id === ruleId,
  );
}
