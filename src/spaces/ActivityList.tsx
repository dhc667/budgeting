import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { type Category, useCategories } from "../categories/category-queries";
import { useFormat } from "../format/use-format";
import { useMoney } from "../money/use-money";
import { displayNameOf, type User, useUsers } from "../profile/profile-queries";
import { Constants, type Enums, type Json } from "../supabase/database.types";
import { EmptyState } from "../ui/Card";
import type { Activity } from "./space-queries";

export function ActivityList({ activity }: { activity: Activity[] | undefined }) {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useMoney();
  const { data: users = [] } = useUsers();
  const { data: categories = [] } = useCategories();
  if (!activity) return null;
  const phrasing: Phrasing = { users, categories, t, money, day: format.day };
  const entries = activity.flatMap((entry) => {
    const lines = describe(entry, phrasing);
    return lines.length === 0 ? [] : [{ id: entry.id, lines, at: new Date(entry.changed_at) }];
  });
  if (entries.length === 0) return <EmptyState>{t("activity.empty")}</EmptyState>;

  return (
    <ol className="flex flex-col gap-3">
      {entries.map(({ id, lines, at }) => (
        <li key={id} className="flex flex-col">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
          <time dateTime={at.toISOString()} className="text-sm text-zinc-500">
            {format.date(at)} {format.time(at)}
          </time>
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
      return [];
    case "delete":
      if (member === undefined) return [t("activity.member.accountDeleted")];
      return ownDoing
        ? [t("activity.member.left", { actor })]
        : [t("activity.member.removed", { actor, member })];
  }
}

function describeLedgerAccountChange(entry: Activity, actor: string, phrasing: Phrasing): string[] {
  const kind = ledgerAccountKinds.find((kind) => kind === valueAt(entry.new ?? entry.old, "kind"));
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
          valueAt(entry.new, "archived") === true
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
      const movedTo = stringAt(valueAt(entry.old, "moved_to") ?? null, "name");
      const count = valueAt(entry.old, "moved_transactions");
      return movedTo === null || typeof count !== "number"
        ? [t("activity.category.deleted", { actor, name })]
        : [t("activity.category.deletedAndMoved", { actor, name, count, to: movedTo })];
    }
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
          valueAt(entry.new, "kind") === "income"
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

function describeTransactionChange(entry: Activity, actor: string, phrasing: Phrasing): string[] {
  const { t, money, day } = phrasing;
  const postings = postingsOf(entry.new ?? entry.old);
  const account = postings.find(({ account_kind }) => account_kind === "account");
  const isOpeningBalance = postings.some(({ account_kind }) => account_kind === "opening_balance");
  if (!account || !isOpeningBalance) return [];
  const details = {
    actor,
    account: account.account_name,
    amount: money(account.amount, account.currency),
    date: day(stringAt(entry.new ?? entry.old, "date") ?? ""),
  };
  switch (entry.action) {
    case "insert":
      return [t("activity.openingBalance.set", details)];
    case "update":
      return [t("activity.openingBalance.changed", details)];
    case "delete":
      return [t("activity.openingBalance.removed", details)];
  }
}

function hasChanged(entry: Activity, key: string): boolean {
  return JSON.stringify(valueAt(entry.old, key)) !== JSON.stringify(valueAt(entry.new, key));
}

function postingsOf(snapshot: Json): Posting[] {
  const postings = valueAt(snapshot, "postings");
  if (!Array.isArray(postings)) return [];
  return postings.flatMap((posting) => {
    const account_kind = ledgerAccountKinds.find(
      (kind) => kind === valueAt(posting, "account_kind"),
    );
    const account_name = stringAt(posting, "account_name") ?? "";
    const currency = stringAt(posting, "currency");
    const amount = valueAt(posting, "amount");
    if (account_kind === undefined || currency === null || typeof amount !== "number") return [];
    return [{ account_kind, account_name, currency, amount }];
  });
}

function stringAt(row: Json, key: string): string | null {
  const value = valueAt(row, key);
  return typeof value === "string" ? value : null;
}

function valueAt(row: Json, key: string): Json | undefined {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return undefined;
  return row[key];
}

const ledgerAccountKinds = Constants.public.Enums.ledger_account_kind;

type Phrasing = {
  users: User[];
  categories: Category[];
  t: TFunction;
  money: (minorUnits: number, currency: string) => string;
  day: (day: string) => string;
};

type Posting = {
  account_kind: Enums<"ledger_account_kind">;
  account_name: string;
  currency: string;
  amount: number;
};
