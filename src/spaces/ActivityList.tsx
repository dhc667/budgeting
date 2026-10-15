import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format/use-format";
import { useMoney } from "../money/use-money";
import { displayNameOf, type User, useUsers } from "../profile/profile-queries";
import type { Json } from "../supabase/database.types";
import { EmptyState } from "../ui/Card";
import type { Activity } from "./space-queries";

export function ActivityList({ activity }: { activity: Activity[] | undefined }) {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useMoney();
  const { data: users = [] } = useUsers();
  if (!activity) return null;
  const context: Context = { users, t, money, day: format.day };
  const entries = activity.flatMap((entry) => {
    const lines = describe(entry, context);
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

type Context = {
  users: User[];
  t: TFunction;
  money: (minorUnits: number, currency: string) => string;
  day: (day: string) => string;
};

function describe(entry: Activity, context: Context): string[] {
  const actor = displayNameOf(context.users, entry.changed_by) ?? context.t("activity.someone");
  switch (entry.table_name) {
    case "spaces":
      return describeSpaceChange(entry, actor, context);
    case "space_members":
      return describeMembershipChange(entry, actor, context);
    case "ledger_accounts":
      return describeAccountChange(entry, actor, context);
    case "transactions":
      return describeTransactionChange(entry, actor, context);
    default:
      return [];
  }
}

function describeSpaceChange(entry: Activity, actor: string, { t }: Context): string[] {
  switch (entry.action) {
    case "insert":
      return [t("activity.space.created", { actor })];
    case "update": {
      const from = text(entry.old, "name");
      const to = text(entry.new, "name");
      return from === to ? [] : [t("activity.space.renamed", { actor, from, to })];
    }
    case "delete":
      return [];
  }
}

function describeMembershipChange(entry: Activity, actor: string, { users, t }: Context): string[] {
  const memberId = text(entry.old ?? entry.new, "user_id");
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

function describeAccountChange(entry: Activity, actor: string, { t }: Context): string[] {
  const name = text(entry.new ?? entry.old, "name");
  switch (entry.action) {
    case "insert":
      return [t("activity.account.added", { actor, name })];
    case "delete":
      return [t("activity.account.deleted", { actor, name })];
    case "update": {
      const changed = (key: string) =>
        JSON.stringify(field(entry.old, key)) !== JSON.stringify(field(entry.new, key));
      const lines: string[] = [];
      if (changed("name"))
        lines.push(
          t("activity.account.renamed", { actor, from: text(entry.old, "name"), to: name }),
        );
      if (changed("currency")) {
        const from = text(entry.old, "currency");
        const to = text(entry.new, "currency");
        lines.push(t("activity.account.currencyChanged", { actor, name, from, to }));
      }
      if (changed("color")) lines.push(t("activity.account.recolored", { actor, name }));
      if (changed("archived"))
        lines.push(
          field(entry.new, "archived") === true
            ? t("activity.account.archived", { actor, name })
            : t("activity.account.unarchived", { actor, name }),
        );
      return lines;
    }
  }
}

// Slice 1 records no transactions but opening balances.
function describeTransactionChange(entry: Activity, actor: string, context: Context): string[] {
  const { t, money, day } = context;
  const postings = postingsOf(entry.new ?? entry.old);
  const account = postings.find(({ account_kind }) => account_kind === "account");
  const isOpeningBalance = postings.some(({ account_kind }) => account_kind === "opening_balance");
  if (!account || !isOpeningBalance) return [];
  const details = {
    actor,
    account: account.account_name,
    amount: money(account.amount, account.currency),
    date: day(text(entry.new ?? entry.old, "date") ?? ""),
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

type Posting = { account_kind: string; account_name: string; currency: string; amount: number };

function postingsOf(snapshot: Json): Posting[] {
  const postings = field(snapshot, "postings");
  if (!Array.isArray(postings)) return [];
  return postings.flatMap((posting) => {
    const account_kind = text(posting, "account_kind");
    const account_name = text(posting, "account_name") ?? "";
    const currency = text(posting, "currency");
    const amount = field(posting, "amount");
    if (account_kind === null || currency === null || typeof amount !== "number") return [];
    return [{ account_kind, account_name, currency, amount }];
  });
}

function text(row: Json, key: string): string | null {
  const value = field(row, key);
  return typeof value === "string" ? value : null;
}

function field(row: Json, key: string): Json | undefined {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return undefined;
  return row[key];
}
