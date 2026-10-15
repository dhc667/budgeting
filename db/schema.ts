import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

// ISO 4217 currencies in circulation. `decimals` is the number of minor units: 2 for USD, 0 for JPY.
export const currencies = pgTable(
  "currencies",
  {
    code: text().primaryKey(),
    decimals: smallint().notNull(),
  },
  () => [
    pgPolicy("users see every currency", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);

export const language = pgEnum("language", ["en", "es-419", "pt-BR"]);
export const numberFormat = pgEnum("number_format", [
  "comma_period",
  "period_comma",
  "space_comma",
  "apostrophe_period",
]);
export const dateFormat = pgEnum("date_format", [
  "day_month_year",
  "month_day_year",
  "year_month_day",
]);

export const profiles = pgTable(
  "profiles",
  {
    // Cascade only reaches users with no history: anything recording who did what must reference
    // profiles with RESTRICT, so deleting a user who has history fails instead of erasing it.
    id: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    displayCurrency: text("display_currency")
      .notNull()
      .default("USD")
      .references(() => currencies.code),
    // Null means Automatic: whatever the device is set to.
    language: language(),
    numberFormat: numberFormat("number_format"),
    dateFormat: dateFormat("date_format"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("display_name_not_blank", sql`trim(${t.displayName}) <> ''`),
    pgPolicy("users see everyone in the instance", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy("users edit their own profile", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.id} = (select auth.uid())`,
      withCheck: sql`${t.id} = (select auth.uid())`,
    }),
  ],
);

// No policies: only the signup hook and trigger (security definer) and the instance CLI (secret key) touch it.
export const inviteCodes = pgTable("invite_codes", {
  codeHash: text("code_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedBy: uuid("used_by").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const spaces = pgTable(
  "spaces",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text(),
    // Cascades because signup creates the private space without logging it: a user with nothing
    // else on record leaves no history behind.
    privateOwner: uuid("private_owner")
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("private_or_named", sql`(${t.privateOwner} is null) = (${t.name} is not null)`),
    check("name_not_blank", sql`trim(${t.name}) <> ''`),
    pgPolicy("members see their spaces", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.is_space_member(${t.id})`,
    }),
    pgPolicy("members rename shared spaces", {
      for: "update",
      to: authenticatedRole,
      using: sql`public.is_space_member(${t.id}) and ${t.privateOwner} is null`,
      withCheck: sql`public.is_space_member(${t.id}) and ${t.privateOwner} is null`,
    }),
    pgPolicy("members delete shared spaces", {
      for: "delete",
      to: authenticatedRole,
      using: sql`public.is_space_member(${t.id}) and ${t.privateOwner} is null`,
    }),
  ],
);

export const spaceMembers = pgTable(
  "space_members",
  {
    id: uuid().primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("one_membership_per_user").on(t.spaceId, t.userId),
    index("space_members_user_id_idx").on(t.userId),
    pgPolicy("members see who else is a member", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.is_space_member(${t.spaceId})`,
    }),
    pgPolicy("members add users", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`public.is_space_member(${t.spaceId})`,
    }),
    pgPolicy("members remove members or leave", {
      for: "delete",
      to: authenticatedRole,
      using: sql`public.is_space_member(${t.spaceId})`,
    }),
  ],
);

export const activityAction = pgEnum("activity_action", ["insert", "update", "delete"]);

// Written only by the activity trigger.
export const activity = pgTable(
  "activity",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    tableName: text("table_name").notNull(),
    rowId: uuid("row_id").notNull(),
    action: activityAction().notNull(),
    // Null for changes no signed-in user made: the instance CLI, or deleting a user.
    changedBy: uuid("changed_by").references(() => profiles.id, { onDelete: "restrict" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    old: jsonb(),
    new: jsonb(),
  },
  (t) => [
    index("activity_space_id_idx").on(t.spaceId),
    index("activity_row_id_idx").on(t.rowId),
    index("activity_changed_by_idx").on(t.changedBy),
    pgPolicy("members see their spaces' activity", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.is_space_member(${t.spaceId})`,
    }),
  ],
);
