import { sql } from "drizzle-orm";
import { check, pgPolicy, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
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

// No policies: only the signup hook and trigger (security definer) and the owner's CLI (secret key) touch it.
export const inviteCodes = pgTable("invite_codes", {
  codeHash: text("code_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedBy: uuid("used_by").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
