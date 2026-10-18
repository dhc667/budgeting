import { memberOf } from "../supabase/json";
import { useTranslation } from "react-i18next";
import { describeBudgetChange } from "../budgets/budget-activity";
import { useCategories } from "../categories/category-queries";
import { useFormat } from "../format/use-format";
import { useMoney } from "../money/use-money";
import { displayNameOf, useUsers } from "../profile/profile-queries";
import { describeRecurringChange } from "../recurring/recurring-activity";
import { RestoreTransaction } from "../transactions/RestoreTransaction";
import {
  describeTransactionChange,
  restorableDeletions,
} from "../transactions/transaction-activity";
import { EmptyState } from "../ui/Card";
import { hasChanged, ledgerAccountKinds, type Phrasing, stringAt } from "./activity";
import type { Activity } from "../activity/activity";

export function ActivityList({ activity }: { activity: Activity[] | undefined }) {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useMoney();
  const { data: users = [] } = useUsers();
  const { data: categories = [] } = useCategories();
  if (!activity) return null;
  const phrasing: Phrasing = { users, categories, t, money, day: format.day };
  const restorable = restorableDeletions(activity);
  const entries = activity.flatMap((entry) => {
    const lines = describe(entry, phrasing);
    if (lines.length === 0) return [];
    const restorableId = restorable.has(entry.id) ? entry.row_id : undefined;
    return [{ id: entry.id, lines, at: new Date(entry.changed_at), restorableId }];
  });
  if (entries.length === 0) return <EmptyState>{t("activity.empty")}</EmptyState>;

  return (
    <ol className="flex flex-col gap-3">
      {entries.map(({ id, lines, at, restorableId }) => (
        <li key={id} className="flex flex-col">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
          <time dateTime={at.toISOString()} className="text-sm text-zinc-500">
            {format.date(at)} {format.time(at)}
          </time>
          {restorableId !== undefined && <RestoreTransaction transactionId={restorableId} />}
        </li>
      ))}
    </ol>
  );
}

function describe(entry: Activity, phrasing: Phrasing): string[] {
  const actor = displayNameOf(phrasing.users, entry.changed_by) ?? phrasing.t("activity.someone");
  switch (entry.table_name) {
    case "spaces":
      return describeSpaceChange(entry, actor, phrasing);
    case "space_members":
      return describeMembershipChange(entry, actor, phrasing);
    case "ledger_accounts":
      return describeLedgerAccountChange(entry, actor, phrasing);
    case "transactions":
      return describeTransactionChange(entry, actor, phrasing);
    case "recurring_transactions":
      return describeRecurringChange(entry, actor, phrasing);
    case "budgets":
      return describeBudgetChange(entry, actor, phrasing);
    default:
      return [];
  }
}

function describeSpaceChange(entry: Activity, actor: string, { t }: Phrasing): string[] {
  switch (entry.action) {
    case "insert":
      return [t("activity.space.created", { actor })];
    case "update": {
      const from = stringAt(entry.old, "name");
      const to = stringAt(entry.new, "name");
      return from === to ? [] : [t("activity.space.renamed", { actor, from, to })];
    }
    case "delete":
    case "restore":
      return [];
  }
}

function describeMembershipChange(
  entry: Activity,
  actor: string,
  { users, t }: Phrasing,
): string[] {
  const memberId = stringAt(entry.old ?? entry.new, "user_id");
  // Activity outlives the users it names: deleting a user without history of their own removes
  // them from their spaces.
  const member = displayNameOf(users, memberId);
  const ownDoing = memberId === entry.changed_by;
  switch (entry.action) {
    // Creating a space makes its creator a member, which "created the space" already says.
    case "insert":
      return ownDoing
        ? []
        : [t("activity.member.added", { actor, member: member ?? t("activity.deletedUser") })];
    case "update":
    case "restore":
      return [];
    case "delete":
      if (member === undefined) return [t("activity.member.accountDeleted")];
      return ownDoing
        ? [t("activity.member.left", { actor })]
        : [t("activity.member.removed", { actor, member })];
  }
}

function describeLedgerAccountChange(entry: Activity, actor: string, phrasing: Phrasing): string[] {
  const kind = ledgerAccountKinds.find((kind) => kind === memberOf(entry.new ?? entry.old, "kind"));
  switch (kind) {
    case "account":
      return describeAccountChange(entry, actor, phrasing);
    case "expense":
    case "income":
      return describeCategoryChange(entry, actor, phrasing);
    case "opening_balance":
    case undefined:
      return [];
  }
}

function describeAccountChange(entry: Activity, actor: string, { t }: Phrasing): string[] {
  const name = stringAt(entry.new ?? entry.old, "name");
  switch (entry.action) {
    case "insert":
      return [t("activity.account.added", { actor, name })];
    case "delete":
      return [t("activity.account.deleted", { actor, name })];
    case "restore":
      return [];
    case "update": {
      const changed = (key: string) => hasChanged(entry, key);
      const lines: string[] = [];
      if (changed("name"))
        lines.push(
          t("activity.account.renamed", { actor, from: stringAt(entry.old, "name"), to: name }),
        );
      if (changed("currency")) {
        const from = stringAt(entry.old, "currency");
        const to = stringAt(entry.new, "currency");
        lines.push(t("activity.account.currencyChanged", { actor, name, from, to }));
      }
      if (changed("color")) lines.push(t("activity.account.recolored", { actor, name }));
      if (changed("archived"))
        lines.push(
          memberOf(entry.new, "archived") === true
            ? t("activity.account.archived", { actor, name })
            : t("activity.account.unarchived", { actor, name }),
        );
      return lines;
    }
  }
}

function describeCategoryChange(
  entry: Activity,
  actor: string,
  { categories, t }: Phrasing,
): string[] {
  const name = stringAt(entry.new ?? entry.old, "name");
  switch (entry.action) {
    case "insert":
      return [t("activity.category.added", { actor, name })];
    case "delete": {
      const movedTo = stringAt(memberOf(entry.old, "moved_to") ?? null, "name");
      const count = memberOf(entry.old, "moved_transactions");
      return movedTo === null || typeof count !== "number"
        ? [t("activity.category.deleted", { actor, name })]
        : [t("activity.category.deletedAndMoved", { actor, name, count, to: movedTo })];
    }
    case "restore":
      return [];
    case "update": {
      const lines: string[] = [];
      if (hasChanged(entry, "name"))
        lines.push(
          t("activity.category.renamed", { actor, from: stringAt(entry.old, "name"), to: name }),
        );
      if (hasChanged(entry, "parent_id")) {
        const parentId = stringAt(entry.new, "parent_id");
        const parent = categories.find(({ id }) => id === parentId);
        lines.push(
          parentId === null
            ? t("activity.category.movedToTop", { actor, name })
            : parent
              ? t("activity.category.movedUnder", { actor, name, parent: parent.name })
              : t("activity.category.movedUnderDeleted", { actor, name }),
        );
      }
      if (hasChanged(entry, "kind"))
        lines.push(
          memberOf(entry.new, "kind") === "income"
            ? t("activity.category.madeIncome", { actor, name })
            : t("activity.category.madeExpense", { actor, name }),
        );
      if (hasChanged(entry, "icon"))
        lines.push(t("activity.category.iconChanged", { actor, name }));
      if (hasChanged(entry, "color")) lines.push(t("activity.category.recolored", { actor, name }));
      return lines;
    }
  }
}
