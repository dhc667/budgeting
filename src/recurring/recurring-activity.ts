import { memberOf } from "../supabase/json";
import { hasChanged, type Phrasing, stringAt } from "../spaces/activity";
import type { Activity } from "../activity/activity";
import type { Json } from "../supabase/database.types";
import { nextDueDate, type Schedule, units } from "./schedule";

export function describeRecurringChange(
  entry: Activity,
  actor: string,
  phrasing: Phrasing,
): string[] {
  const before = snapshotOf(entry.old);
  const after = snapshotOf(entry.new);
  const shown = after ?? before;
  if (!shown) return [];
  const { t } = phrasing;
  const details = { actor, label: labelOf(shown, phrasing) };
  switch (entry.action) {
    case "insert":
      return [t("activity.recurring.created", details)];
    case "delete":
      return [t("activity.recurring.deleted", details)];
    case "restore":
      return [];
    case "update":
      if (!before || !after) return [];
      return describeRecurringEdit(entry, before, after, details, phrasing);
  }
}

function describeRecurringEdit(
  entry: Activity,
  before: Snapshot,
  after: Snapshot,
  details: { actor: string; label: string },
  { t, day }: Phrasing,
): string[] {
  const due = nextDueDate(before.schedule, before.done);
  const dueDetails = { ...details, date: due === null ? "" : day(due) };
  if (memberOf(entry.new, "recorded") !== undefined)
    return [t("activity.recurring.recorded", dueDetails)];
  if (memberOf(entry.new, "skipped") !== undefined)
    return [t("activity.recurring.skipped", dueDetails)];
  if (before.paused !== after.paused)
    return [
      after.paused
        ? t("activity.recurring.paused", details)
        : t("activity.recurring.resumed", details),
    ];
  return changedKeys.some((key) => hasChanged(entry, key))
    ? [t("activity.recurring.changed", details)]
    : [];
}

function labelOf(snapshot: Snapshot, { categories, t }: Phrasing): string {
  if (snapshot.title !== null) return snapshot.title;
  const category = categories.find(({ id }) => id === snapshot.categoryId);
  return category?.name ?? t("transactions.transfer");
}

function snapshotOf(row: Json): Snapshot | null {
  const startsOn = stringAt(row, "starts_on");
  const every = memberOf(row, "every");
  const unit = units.find((candidate) => candidate === stringAt(row, "unit"));
  const done = memberOf(row, "done");
  const times = memberOf(row, "times");
  if (startsOn === null || typeof every !== "number" || !unit || typeof done !== "number")
    return null;
  return {
    title: stringAt(row, "title"),
    categoryId: stringAt(row, "category_id"),
    schedule: {
      startsOn,
      every,
      unit,
      endsOn: stringAt(row, "ends_on"),
      times: typeof times === "number" ? times : null,
    },
    done,
    paused: memberOf(row, "paused") === true,
  };
}

// What a member edits. `space_id` follows the account, and `done` moves on by recording or skipping.
const changedKeys = [
  "type",
  "title",
  "note",
  "account_id",
  "amount",
  "category_id",
  "to_account_id",
  "to_amount",
  "starts_on",
  "every",
  "unit",
  "ends_on",
  "times",
];

type Snapshot = {
  title: string | null;
  categoryId: string | null;
  schedule: Schedule;
  done: number;
  paused: boolean;
};
