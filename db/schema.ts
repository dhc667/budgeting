import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

export const color = pgEnum("color", [
  "red",
  "orange",
  "amber",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
  "slate",
]);

export const ledgerAccountKind = pgEnum("ledger_account_kind", [
  "account",
  "expense",
  "income",
  "opening_balance",
]);

// Money accounts and categories alike (ADR 0002). The app reads money accounts through the
// `accounts` view, and adds them with `create_account`.
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    kind: ledgerAccountKind().notNull(),
    name: text(),
    // Only a money account holds one currency: money of any currency can pass through a category.
    currency: text().references(() => currencies.code),
    color: color(),
    // A Lucide icon name. The app draws a fallback for a name it doesn't offer.
    icon: text(),
    parentId: uuid("parent_id").references((): AnyPgColumn => ledgerAccounts.id),
    position: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "named_unless_opening_balance",
      sql`(${t.kind} = 'opening_balance') = (${t.name} is null)`,
    ),
    check("name_not_blank", sql`trim(${t.name}) <> ''`),
    check("currency_only_on_accounts", sql`(${t.kind} = 'account') = (${t.currency} is not null)`),
    check(
      "colored_unless_opening_balance",
      sql`(${t.kind} = 'opening_balance') = (${t.color} is null)`,
    ),
    check(
      "icon_only_on_categories",
      sql`(${t.kind} in ('expense', 'income')) = (${t.icon} is not null)`,
    ),
    index("ledger_accounts_space_id_idx").on(t.spaceId),
    index("ledger_accounts_parent_id_idx").on(t.parentId),
    uniqueIndex("one_opening_balance_category_per_space")
      .on(t.spaceId)
      .where(sql`${t.kind} = 'opening_balance'`),
    pgPolicy("members see their spaces' accounts and categories", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.is_space_member(${t.spaceId})`,
    }),
    pgPolicy("members edit their spaces' accounts", {
      for: "update",
      to: authenticatedRole,
      using: sql`public.is_space_member(${t.spaceId}) and ${t.kind} = 'account'`,
      withCheck: sql`public.is_space_member(${t.spaceId}) and ${t.kind} = 'account'`,
    }),
    pgPolicy("members delete their spaces' accounts", {
      for: "delete",
      to: authenticatedRole,
      using: sql`public.is_space_member(${t.spaceId}) and ${t.kind} = 'account'`,
    }),
  ],
);

// The categories every new space starts with. No policies: only the trigger adding them reads it.
export const starterCategories = pgTable("starter_categories", {
  id: smallint().primaryKey(),
  kind: ledgerAccountKind().notNull(),
  icon: text().notNull(),
  color: color().notNull(),
}).enableRLS();

export const starterCategoryNames = pgTable(
  "starter_category_names",
  {
    starterCategoryId: smallint("starter_category_id")
      .notNull()
      .references(() => starterCategories.id),
    language: language().notNull(),
    name: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.starterCategoryId, t.language] })],
).enableRLS();

// Never stored: the `transaction_details` view works it out from a transaction's postings.
export const transactionType = pgEnum("transaction_type", [
  "expense",
  "refund",
  "income",
  "transfer",
]);

// Written only by Postgres functions, which keep each transaction's postings balanced.
export const transactions = pgTable(
  "transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    date: date().notNull(),
    title: text(),
    note: text(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("title_not_blank", sql`trim(${t.title}) <> ''`),
    check("note_not_blank", sql`trim(${t.note}) <> ''`),
    index("transactions_created_by_idx").on(t.createdBy),
    index("transactions_newest_first_idx").on(t.date.desc(), t.createdAt.desc()),
    pgPolicy("members see transactions touching their spaces", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from public.postings where postings.transaction_id = ${t.id})`,
    }),
  ],
);

export const postings = pgTable(
  "postings",
  {
    id: uuid().primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    ledgerAccountId: uuid("ledger_account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    currency: text()
      .notNull()
      .references(() => currencies.code),
    amount: bigint({ mode: "number" }).notNull(),
  },
  (t) => [
    index("postings_transaction_id_idx").on(t.transactionId),
    index("postings_ledger_account_id_idx").on(t.ledgerAccountId),
    pgPolicy("members see postings in their spaces", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from public.ledger_accounts where ledger_accounts.id = ${t.ledgerAccountId})`,
    }),
  ],
);
