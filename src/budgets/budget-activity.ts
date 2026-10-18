import { memberOf } from "../supabase/json";
import { hasChanged, type Phrasing, stringAt } from "../spaces/activity";
import type { Activity } from "../activity/activity";

export function describeBudgetChange(entry: Activity, actor: string, phrasing: Phrasing): string[] {
  const { t } = phrasing;
  const name = stringAt(entry.new ?? entry.old, "name");
  switch (entry.action) {
    case "insert":
      return [t("activity.budget.created", { actor, name })];
    case "delete":
      return [t("activity.budget.deleted", { actor, name })];
    case "restore":
      return [];
    case "update":
      return describeBudgetEdit(entry, { actor, name }, phrasing);
  }
}

function describeBudgetEdit(
  entry: Activity,
  details: { actor: string; name: string | null },
  { t, money, day }: Phrasing,
): string[] {
  const excluded = memberOf(entry.new, "excluded");
  if (excluded !== undefined) {
    const date = stringAt(excluded, "date");
    return [
      t("activity.budget.excluded", {
        ...details,
        transaction: stringAt(excluded, "title"),
        date: date === null ? "" : day(date),
      }),
    ];
  }
  const included = memberOf(entry.new, "included");
  if (included !== undefined) {
    const date = stringAt(included, "date");
    return [
      t("activity.budget.included", {
        ...details,
        transaction: stringAt(included, "title"),
        date: date === null ? "" : day(date),
      }),
    ];
  }

  const lines: string[] = [];
  if (hasChanged(entry, "name"))
    lines.push(t("activity.budget.renamed", { ...details, from: stringAt(entry.old, "name") }));
  const currency = stringAt(entry.new, "currency") ?? "";
  const before = memberOf(entry.old, "amount");
  const after = memberOf(entry.new, "amount");
  if (hasChanged(entry, "amount") && typeof before === "number" && typeof after === "number")
    lines.push(
      t("activity.budget.limitChanged", {
        ...details,
        from: money(before, stringAt(entry.old, "currency") ?? currency),
        to: money(after, currency),
      }),
    );
  if (otherKeys.some((key) => hasChanged(entry, key)))
    lines.push(t("activity.budget.changed", details));
  return lines;
}

const otherKeys = [
  "currency",
  "starts_on",
  "ends_on",
  "every",
  "unit",
  "carry_unspent",
  "carry_overspent",
  "category_ids",
  "account_ids",
];
