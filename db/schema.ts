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
  numeric,
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

// Set by a trigger to the id of the Postgres transaction that wrote the row (ADR 0012).
function version() {
  return bigint({ mode: "number" }).notNull().default(0);
}

// How names compare for uniqueness: case and runs of spaces don't count, accents do. The app and
// the CLI compare them the same way (src/names.ts).
function nameKey(name: AnyPgColumn) {
  return sql`lower(btrim(regexp_replace(${name}, '[[:space:]]+', ' ', 'g')))`;
}

// ISO 4217 currencies in circulation. `decimals` is the number of minor units: 2 for USD, 0 for JPY.
export const currencies = pgTable(
  "currencies",
  {
    version: version(),
    code: text().primaryKey(),
    decimals: smallint().notNull(),
    // Its exchange rates are loaded by the instance owner, not fetched.
    ratesByHand: boolean("rates_by_hand").notNull().default(false),
  },
  (t) => [
    index("currencies_version_idx").on(t.version),
    pgPolicy("users see every currency", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);

// Units of a currency per 1 USD, saved by `save_exchange_rates`. USD is the base and has no rows.
// Weekends and holidays have none either: a date's rate is the latest one on or before it.
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    version: version(),
    date: date().notNull(),
    currency: text()
      .notNull()
      .references(() => currencies.code),
    rate: numeric({ mode: "number" }).notNull(),
  },
  (t) => [
    index("exchange_rates_version_idx").on(t.version),
    primaryKey({ columns: [t.date, t.currency] }),
    check("rate_positive", sql`${t.rate} > 0`),
    index("exchange_rates_currency_date_idx").on(t.currency, t.date.desc()),
    pgPolicy("users see every exchange rate", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);

// Keyed on the provider: another one may have older rates.
export const exchangeRateHistoryStarts = pgTable(
  "exchange_rate_history_starts",
  {
    version: version(),
    provider: text().notNull(),
    currency: text()
      .notNull()
      .references(() => currencies.code),
    // The provider has no rates for the currency before this day.
    startsOn: date("starts_on").notNull(),
    checkedOn: date("checked_on").notNull(),
  },
  (t) => [
    index("exchange_rate_history_starts_version_idx").on(t.version),
    primaryKey({ columns: [t.provider, t.currency] }),
    pgPolicy("users see where every provider's history starts", {
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
    version: version(),
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
    // How many days ahead of today the dashboard shows upcoming transactions, besides overdue ones.
    upcomingDays: smallint("upcoming_days").notNull().default(7),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("profiles_version_idx").on(t.version),
    check("display_name_not_blank", sql`trim(${t.displayName}) <> ''`),
    check("upcoming_days_within_a_year", sql`${t.upcomingDays} between 0 and 365`),
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

// Users may insert only code_hash (granted in a migration), so their codes always take the
// default expiry and can't be read back.
export const inviteCodes = pgTable(
  "invite_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBy: uuid("used_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy("users invite people", { for: "insert", to: authenticatedRole, withCheck: sql`true` }),
  ],
).enableRLS();

export const spaces = pgTable(
  "spaces",
  {
    version: version(),
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
    index("spaces_version_idx").on(t.version),
    check("private_or_named", sql`(${t.privateOwner} is null) = (${t.name} is not null)`),
    check("name_not_blank", sql`trim(${t.name}) <> ''`),
    // The private space's name in each of the app's languages. A test fails when a language's
    // label for it is missing here.
    check("name_not_reserved", sql`${nameKey(t.name)} not in ('private', 'privado')`),
    uniqueIndex("shared_space_names").on(nameKey(t.name)),
    pgPolicy("members see their spaces", {
      for: "select",
      to: authenticatedRole,
      using: inMySpaces(t.id),
    }),
    pgPolicy("members rename shared spaces", {
      for: "update",
      to: authenticatedRole,
      using: sql`${inMySpaces(t.id)} and ${t.privateOwner} is null`,
      withCheck: sql`${inMySpaces(t.id)} and ${t.privateOwner} is null`,
    }),
    pgPolicy("members delete shared spaces", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${inMySpaces(t.id)} and ${t.privateOwner} is null`,
    }),
  ],
);

export const spaceMembers = pgTable(
  "space_members",
  {
    version: version(),
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
    index("space_members_version_idx").on(t.version),
    unique("one_membership_per_user").on(t.spaceId, t.userId),
    index("space_members_user_id_idx").on(t.userId),
    pgPolicy("members see who else is a member", {
      for: "select",
      to: authenticatedRole,
      using: inMySpaces(t.spaceId),
    }),
    pgPolicy("members add users", {
      for: "insert",
      to: authenticatedRole,
      withCheck: inMySpaces(t.spaceId),
    }),
    pgPolicy("members remove members or leave", {
      for: "delete",
      to: authenticatedRole,
      using: inMySpaces(t.spaceId),
    }),
  ],
);

export const activityAction = pgEnum("activity_action", ["insert", "update", "delete", "restore"]);

// Written only by the activity trigger.
export const activity = pgTable(
  "activity",
  {
    version: version(),
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
    index("activity_version_idx").on(t.version),
    index("activity_space_id_idx").on(t.spaceId),
    index("activity_row_id_idx").on(t.rowId),
    index("activity_changed_by_idx").on(t.changedBy),
    pgPolicy("members see their spaces' activity", {
      for: "select",
      to: authenticatedRole,
      using: inMySpaces(t.spaceId),
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
  "counterparty",
]);

// Categories every space has, which the app names in its user's language. Only a forgiven debt is
// recorded in either.
export const builtInCategory = pgEnum("built_in_category", [
  "debts_forgiven",
  "debts_forgiven_to_you",
]);

// Money accounts, categories and counterparties alike (ADR 0002). The app reads money accounts through the
// `accounts` view, and adds them with `create_account`.
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    version: version(),
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
    builtIn: builtInCategory("built_in"),
    position: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_accounts_version_idx").on(t.version),
    check(
      "named_unless_opening_balance_or_built_in",
      sql`(${t.kind} = 'opening_balance' or ${t.builtIn} is not null) = (${t.name} is null)`,
    ),
    check(
      "built_in_category_of_its_kind",
      sql`${t.builtIn} is null
        or (${t.builtIn} = 'debts_forgiven' and ${t.kind} = 'expense')
        or (${t.builtIn} = 'debts_forgiven_to_you' and ${t.kind} = 'income')`,
    ),
    check("built_in_category_unnested", sql`${t.builtIn} is null or ${t.parentId} is null`),
    check("name_not_blank", sql`trim(${t.name}) <> ''`),
    // A slash would make a category's path, Food/Luxury, ambiguous.
    check(
      "category_name_without_slash",
      sql`${t.kind} not in ('expense', 'income') or position('/' in ${t.name}) = 0`,
    ),
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
    uniqueIndex("one_of_each_built_in_category_per_space")
      .on(t.spaceId, t.builtIn)
      .where(sql`${t.builtIn} is not null`),
    uniqueIndex("account_names_per_space")
      .on(t.spaceId, nameKey(t.name))
      .where(sql`${t.kind} = 'account'`),
    uniqueIndex("counterparty_names_per_space")
      .on(t.spaceId, nameKey(t.name))
      .where(sql`${t.kind} = 'counterparty'`),
    // A subcategory has its parent's space and kind, so its parent alone picks out its siblings.
    uniqueIndex("top_level_category_names_per_space_and_kind")
      .on(t.spaceId, t.kind, nameKey(t.name))
      .where(sql`${t.kind} in ('expense', 'income') and ${t.parentId} is null`),
    uniqueIndex("subcategory_names_per_parent")
      .on(t.parentId, nameKey(t.name))
      .where(sql`${t.parentId} is not null`),
    pgPolicy("members see their spaces' accounts and categories", {
      for: "select",
      to: authenticatedRole,
      using: inMySpaces(t.spaceId),
    }),
    pgPolicy("members edit their spaces' accounts", {
      for: "update",
      to: authenticatedRole,
      using: sql`${inMySpaces(t.spaceId)} and ${t.kind} = 'account'`,
      withCheck: sql`${inMySpaces(t.spaceId)} and ${t.kind} = 'account'`,
    }),
    pgPolicy("members delete their spaces' accounts", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${inMySpaces(t.spaceId)} and ${t.kind} = 'account'`,
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
  "given",
  "received",
  "forgave",
  "forgiven",
]);

// Written only by Postgres functions, which keep each transaction's postings balanced.
export const transactions = pgTable(
  "transactions",
  {
    version: version(),
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
    index("transactions_version_idx").on(t.version),
    check("title_not_blank", sql`trim(${t.title}) <> ''`),
    check("note_not_blank", sql`trim(${t.note}) <> ''`),
    index("transactions_created_by_idx").on(t.createdBy),
    // In the app's order exactly, nulls first as Postgres puts them in a descending order: with
    // Drizzle's nulls last, the list sorts every transaction rather than reading one page.
    index("transactions_newest_first_idx").on(
      t.date.desc().nullsFirst(),
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
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
    version: version(),
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
    index("postings_version_idx").on(t.version),
    index("postings_transaction_id_idx").on(t.transactionId),
    index("postings_ledger_account_id_idx").on(t.ledgerAccountId),
    pgPolicy("members see postings in their spaces", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from public.ledger_accounts where ledger_accounts.id = ${t.ledgerAccountId})`,
    }),
  ],
);

export const repeatUnit = pgEnum("repeat_unit", ["day", "week", "month", "year"]);

// Written only by Postgres functions. Its upcoming transaction isn't stored: the app works out when
// it is due from the schedule and `done` (ADR 0009), so only the next one can ever exist.
export const recurringTransactions = pgTable(
  "recurring_transactions",
  {
    version: version(),
    id: uuid().primaryKey().defaultRandom(),
    // The space of the account the money leaves or reaches, where the rule's activity is logged.
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    type: transactionType().notNull(),
    title: text(),
    note: text(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "cascade" }),
    amount: bigint({ mode: "number" }).notNull(),
    categoryId: uuid("category_id").references(() => ledgerAccounts.id),
    toAccountId: uuid("to_account_id").references(() => ledgerAccounts.id, {
      onDelete: "cascade",
    }),
    toAmount: bigint("to_amount", { mode: "number" }),
    startsOn: date("starts_on").notNull(),
    every: integer().notNull(),
    unit: repeatUnit().notNull(),
    endsOn: date("ends_on"),
    times: integer(),
    // How many of its occurrences were recorded or skipped.
    done: integer().notNull().default(0),
    paused: boolean().notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recurring_transactions_version_idx").on(t.version),
    check("title_not_blank", sql`trim(${t.title}) <> ''`),
    check("note_not_blank", sql`trim(${t.note}) <> ''`),
    check("amount_positive", sql`${t.amount} > 0`),
    check("to_amount_positive", sql`${t.toAmount} > 0`),
    check(
      "category_or_to_account",
      sql`(${t.type} = 'transfer') = (${t.toAccountId} is not null and ${t.categoryId} is null)`,
    ),
    check("every_positive", sql`${t.every} > 0`),
    check("times_positive", sql`${t.times} > 0`),
    check("ends_on_or_after_start", sql`${t.endsOn} >= ${t.startsOn}`),
    check("one_end", sql`${t.endsOn} is null or ${t.times} is null`),
    check("done_not_negative", sql`${t.done} >= 0`),
    index("recurring_transactions_space_id_idx").on(t.spaceId),
    index("recurring_transactions_account_id_idx").on(t.accountId),
    index("recurring_transactions_category_id_idx").on(t.categoryId),
    index("recurring_transactions_to_account_id_idx").on(t.toAccountId),
    index("recurring_transactions_created_by_idx").on(t.createdBy),
    // A transfer from another space only shows to those who could record it, as it would then
    // touch an account they can't see.
    pgPolicy("members of every space a rule touches see it", {
      for: "select",
      to: authenticatedRole,
      using: sql`${inMySpaces(t.spaceId)} and (${t.toAccountId} is null or exists (select 1 from public.ledger_accounts where ledger_accounts.id = ${t.toAccountId}))`,
    }),
  ],
);

// Repeating when it has `every` and `unit`, from `starts_on` on; otherwise from `starts_on` to `ends_on`.
export const budgets = pgTable(
  "budgets",
  {
    version: version(),
    id: uuid().primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    currency: text()
      .notNull()
      .references(() => currencies.code),
    // Each period's, before carry-over, in minor units of `currency`.
    amount: bigint({ mode: "number" }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    every: integer(),
    unit: repeatUnit(),
    carryUnspent: boolean("carry_unspent").notNull().default(false),
    carryOverspent: boolean("carry_overspent").notNull().default(false),
    // Null means every one in the space, including those added later. Ids, not foreign keys, so a
    // change is one row in the budget's history: deleting a category or account rewrites them.
    categoryIds: uuid("category_ids").array(),
    accountIds: uuid("account_ids").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("budgets_version_idx").on(t.version),
    check("name_not_blank", sql`trim(${t.name}) <> ''`),
    check("amount_positive", sql`${t.amount} > 0`),
    check("every_positive", sql`${t.every} > 0`),
    check(
      "repeating_or_fixed",
      sql`(${t.every} is not null and ${t.unit} is not null and ${t.endsOn} is null) or (${t.every} is null and ${t.unit} is null and ${t.endsOn} is not null)`,
    ),
    check("ends_on_or_after_start", sql`${t.endsOn} >= ${t.startsOn}`),
    check(
      "carry_over_only_when_repeating",
      sql`${t.every} is not null or not (${t.carryUnspent} or ${t.carryOverspent})`,
    ),
    index("budgets_space_id_idx").on(t.spaceId),
    pgPolicy("members see their spaces' budgets", {
      for: "select",
      to: authenticatedRole,
      using: inMySpaces(t.spaceId),
    }),
    pgPolicy("members add budgets", {
      for: "insert",
      to: authenticatedRole,
      withCheck: inMySpaces(t.spaceId),
    }),
    pgPolicy("members edit their spaces' budgets", {
      for: "update",
      to: authenticatedRole,
      using: inMySpaces(t.spaceId),
      withCheck: inMySpaces(t.spaceId),
    }),
    pgPolicy("members delete their spaces' budgets", {
      for: "delete",
      to: authenticatedRole,
      using: inMySpaces(t.spaceId),
    }),
  ],
);

// Transactions a budget leaves out though they fall within it. Written only by
// `set_budget_exclusions`.
export const budgetExclusions = pgTable(
  "budget_exclusions",
  {
    version: version(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("budget_exclusions_version_idx").on(t.version),
    primaryKey({ columns: [t.budgetId, t.transactionId] }),
    index("budget_exclusions_transaction_id_idx").on(t.transactionId),
    pgPolicy("members see what their spaces' budgets leave out", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from public.budgets where budgets.id = ${t.budgetId})`,
    }),
  ],
);

// Written only by the trigger that records deletions (ADR 0012). A key tells another space nothing.
export const deletedRows = pgTable(
  "deleted_rows",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tableName: text("table_name").notNull(),
    key: jsonb().notNull(),
    version: bigint({ mode: "number" }).notNull(),
  },
  (t) => [
    index("deleted_rows_version_idx").on(t.version),
    pgPolicy("users see every deleted row", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);

// Rather than `in (select …)`: Postgres then expects the few spaces a user is in, not a thousand
// rows, and reads only theirs through the space_id index instead of scanning the whole table.
function inMySpaces(spaceId: AnyPgColumn) {
  return sql`${spaceId} = any (array(select public.my_space_ids()))`;
}
