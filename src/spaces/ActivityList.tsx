import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format/use-format";
import { displayNameOf, type User, useUsers } from "../profile/profile-queries";
import type { Json } from "../supabase/database.types";
import { EmptyState } from "../ui/Card";
import { type Activity, useSpaceActivity } from "./space-queries";

export function ActivityList({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: activity } = useSpaceActivity(spaceId);
  const { data: users = [] } = useUsers();
  if (!activity) return null;
  const entries = activity.flatMap((entry) => {
    const text = describe(entry, users, t);
    return text === null ? [] : [{ id: entry.id, text, at: new Date(entry.changed_at) }];
  });
  if (entries.length === 0) return <EmptyState>{t("activity.empty")}</EmptyState>;

  return (
    <ol className="flex flex-col gap-3">
      {entries.map(({ id, text, at }) => (
        <li key={id} className="flex flex-col">
          <span>{text}</span>
          <time dateTime={at.toISOString()} className="text-sm text-zinc-500">
            {format.date(at)} {format.time(at)}
          </time>
        </li>
      ))}
    </ol>
  );
}

function describe(entry: Activity, users: User[], t: TFunction): string | null {
  const actor = displayNameOf(users, entry.changed_by) ?? t("activity.someone");
  switch (entry.table_name) {
    case "spaces":
      return describeSpaceChange(entry, actor, t);
    case "space_members":
      return describeMembershipChange(entry, actor, users, t);
    default:
      return null;
  }
}

function describeSpaceChange(entry: Activity, actor: string, t: TFunction): string | null {
  switch (entry.action) {
    case "insert":
      return t("activity.space.created", { actor });
    case "update": {
      const from = field(entry.old, "name");
      const to = field(entry.new, "name");
      return from === to ? null : t("activity.space.renamed", { actor, from, to });
    }
    case "delete":
      return null;
  }
}

function describeMembershipChange(
  entry: Activity,
  actor: string,
  users: User[],
  t: TFunction,
): string | null {
  const memberId = field(entry.old ?? entry.new, "user_id");
  // Activity outlives the users it names: deleting a user without history of their own removes
  // them from their spaces.
  const member = displayNameOf(users, memberId);
  const ownDoing = memberId === entry.changed_by;
  switch (entry.action) {
    // Creating a space makes its creator a member, which "created the space" already says.
    case "insert":
      return ownDoing
        ? null
        : t("activity.member.added", { actor, member: member ?? t("activity.deletedUser") });
    case "update":
      return null;
    case "delete":
      if (member === undefined) return t("activity.member.accountDeleted");
      return ownDoing
        ? t("activity.member.left", { actor })
        : t("activity.member.removed", { actor, member });
  }
}

function field(row: Json, key: string): string | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const value = row[key];
  return typeof value === "string" ? value : null;
}
