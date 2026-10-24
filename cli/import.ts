import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import * as z from "zod";
import { nameKey, sameName } from "../src/names.ts";
import { Constants } from "../src/supabase/database.types.ts";
import { defined } from "./defined.ts";

// Everything goes through the app's own functions, acting as the user, in one database
// transaction: a file that breaks any rule of the app leaves nothing behind.
export async function importIntoPrivateSpace(
  sql: Sql,
  email: string,
  file: ImportFile,
  { replaceCategories = false } = {},
): Promise<ImportedAccount[]> {
  return sql.begin(async (tx) => {
    const userId = await actAs(tx, email);
    const spaceId = await privateSpaceOf(tx, userId);
    await refuseExistingAccounts(tx, spaceId, file.accounts);
    if (replaceCategories) await deleteCategories(tx, spaceId);
    const categoryIds = await addCategories(tx, spaceId, file.categories);
    const accountIds = await addAccounts(tx, spaceId, file.accounts);
    await addTransactions(tx, file.transactions, accountIds, categoryIds);
    return balances(tx, spaceId, file.accounts);
  });
}

async function actAs(tx: TransactionSql, email: string): Promise<string> {
  const [user] = await tx<{ id: string }[]>`
    select id from auth.users where lower(email) = lower(${email})`;
  if (!user) throw new ImportError(`No user with email ${email}.`);
  const claims = JSON.stringify({ sub: user.id, role: "authenticated" });
  await tx`select set_config('request.jwt.claims', ${claims}, true)`;
  return user.id;
}

async function privateSpaceOf(tx: TransactionSql, userId: string): Promise<string> {
  const [space] = await tx<{ id: string }[]>`
    select id from public.spaces where private_owner = ${userId}`;
  if (!space) throw new ImportError("The user has no private space.");
  return space.id;
}

// Accounts are the one thing a second run of the same file would duplicate.
async function refuseExistingAccounts(tx: TransactionSql, spaceId: string, accounts: Account[]) {
  const inSpace = await tx<{ name: string }[]>`
    select name from public.ledger_accounts where space_id = ${spaceId} and kind = 'account'`;
  const existing = accounts.flatMap((a) => inSpace.filter((b) => sameName(a.name, b.name)));
  if (existing.length > 0) {
    throw new ImportError(
      `The private space already has ${existing.map((a) => a.name).join(", ")}. Was this file imported before?`,
    );
  }
}

// Only categories nothing is in: delete_category would need somewhere to move transactions to.
// Built-in categories stay: every space has them.
async function deleteCategories(tx: TransactionSql, spaceId: string) {
  const inUse = await tx<{ label: string }[]>`
    select concat_ws(' › ', parent.name, category.name) as label
    from public.categories as category
    left join public.categories as parent on parent.id = category.parent_id
    where category.space_id = ${spaceId}
      and category.built_in is null
      and category.transaction_count > 0
    order by category.kind, label`;
  if (inUse.length > 0) {
    throw new ImportError(
      `The categories ${inUse.map((c) => c.label).join(", ")} have transactions, so they can't be replaced.`,
    );
  }
  for (const level of [tx`parent_id is not null`, tx`parent_id is null`]) {
    await tx`
      select public.delete_category(id, null)
      from public.categories
      where space_id = ${spaceId} and built_in is null and ${level}`;
  }
}

// A category the space already has, by kind, name and parent, is used as it is.
async function addCategories(
  tx: TransactionSql,
  spaceId: string,
  categories: Category[],
): Promise<Map<string, string>> {
  const existing = await tx<{ id: string; name: string; kind: Kind; parent_id: string | null }[]>`
    select id, name, kind, parent_id from public.ledger_accounts
    where space_id = ${spaceId} and kind in ('expense', 'income') and built_in is null`;
  const ids = new Map<string, string>();

  const findOrCreate = async (kind: Kind, spec: CategorySpec, parent: string | null) => {
    const found = existing.find(
      (c) => c.kind === kind && sameName(c.name, spec.name) && c.parent_id === parent,
    );
    if (found) return found.id;
    const [created] = await tx<{ id: string }[]>`
      select public.create_category(
        ${spaceId}, ${spec.name}, ${kind}, ${spec.icon}, ${spec.color}, ${parent}
      ) as id`;
    return defined(created).id;
  };

  for (const category of categories) {
    const id = await findOrCreate(category.kind, category, null);
    ids.set(categoryKey(category.kind, category.name), id);
    for (const sub of category.subcategories) {
      ids.set(
        categoryKey(category.kind, category.name, sub.name),
        await findOrCreate(category.kind, sub, id),
      );
    }
  }
  return ids;
}

async function addAccounts(
  tx: TransactionSql,
  spaceId: string,
  accounts: Account[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const account of accounts) {
    const [created] = await tx<{ id: string }[]>`
      select public.create_account(
        ${spaceId}, ${account.name}, ${account.currency}, ${account.color},
        ${account.opening?.amount ?? 0}, ${account.opening?.date ?? null}
      ) as id`;
    ids.set(nameKey(account.name), defined(created).id);
  }
  return ids;
}

// One statement for all of them: a round trip per transaction to a distant database takes minutes.
async function addTransactions(
  tx: TransactionSql,
  transactions: Transaction[],
  accountIds: Map<string, string>,
  categoryIds: Map<string, string>,
) {
  const rows = transactions.map((t, position) => ({
    id: randomUUID(),
    recorded_at: t.recordedAt ?? null,
    position,
    ...transactionArgs(t, accountIds, categoryIds),
  }));

  await tx`
    select count(*) from (
      select public.add_transaction(
        t.id, t.type, t.date, t.title, t.note, t.account, t.amount, t.category, t.to_account, t.to_amount
      )
      from jsonb_to_recordset(${tx.json(rows)}::jsonb) as t(
        id uuid, type public.transaction_type, date date, title text, note text, account uuid,
        amount bigint, category uuid, to_account uuid, to_amount bigint
      )
    ) as added`;
  // add_transaction stamps them all with this database transaction's start, which would leave a
  // day's transactions in random order. A microsecond apart is enough to keep the file's.
  await tx`
    update public.transactions
    set created_at = coalesce(r.recorded_at, now() + r.position * interval '1 microsecond')
    from jsonb_to_recordset(${tx.json(rows)}::jsonb) as r(id uuid, recorded_at timestamptz, position integer)
    where transactions.id = r.id`;
}

function transactionArgs(
  t: Transaction,
  accountIds: Map<string, string>,
  categoryIds: Map<string, string>,
) {
  const common = {
    type: t.type,
    date: t.date,
    title: t.title ?? null,
    note: t.note ?? null,
    account: defined(accountIds.get(nameKey(t.account))),
    amount: t.amount,
  };
  switch (t.type) {
    case "expense":
    case "refund":
    case "income":
      return {
        ...common,
        category: defined(categoryIds.get(categoryKey(kindFor(t.type), t.category, t.subcategory))),
        to_account: null,
        to_amount: null,
      };
    case "transfer":
      return {
        ...common,
        category: null,
        to_account: defined(accountIds.get(nameKey(t.toAccount))),
        to_amount: t.toAmount ?? null,
      };
  }
}

async function balances(
  tx: TransactionSql,
  spaceId: string,
  accounts: Account[],
): Promise<ImportedAccount[]> {
  return tx<ImportedAccount[]>`
    select accounts.name, accounts.currency, accounts.balance::float8 as balance, currencies.decimals
    from public.accounts
    join public.currencies on currencies.code = accounts.currency
    where accounts.space_id = ${spaceId} and accounts.name in ${tx(accounts.map((a) => a.name))}
    order by accounts.position`;
}

function kindFor(type: "expense" | "refund" | "income"): Kind {
  switch (type) {
    case "expense":
    case "refund":
      return "expense";
    case "income":
      return "income";
  }
}

// Names in the file match as the instance compares them.
function categoryKey(kind: Kind, name: string, subcategory?: string): string {
  return JSON.stringify([
    kind,
    nameKey(name),
    subcategory === undefined ? null : nameKey(subcategory),
  ]);
}

export class ImportError extends Error {}

export type ImportedAccount = {
  name: string;
  currency: string;
  balance: number;
  decimals: number;
};

const day = z.iso.date();
const minorUnits = z.int().positive();
const text = z.string().trim().min(1).optional();

const categorySpec = z.strictObject({
  name: z.string().trim().min(1),
  // A Lucide icon name; the app draws a fallback for one it doesn't offer.
  icon: z.string().min(1),
  color: z.enum(Constants.public.Enums.color),
});

const category = categorySpec.extend({
  kind: z.enum(["expense", "income"]),
  subcategories: z.array(categorySpec).default([]),
});

const account = z.strictObject({
  name: z.string().trim().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  color: z.enum(Constants.public.Enums.color),
  opening: z.strictObject({ amount: z.int(), date: day }).optional(),
});

const common = {
  date: day,
  // When it was recorded, which orders a day's transactions. Without it, they keep the order the
  // file lists them in, earliest first.
  recordedAt: z.iso.datetime({ offset: true }).optional(),
  title: text,
  note: text,
  account: z.string(),
  amount: minorUnits,
};

const transaction = z.discriminatedUnion("type", [
  z.strictObject({
    ...common,
    type: z.enum(["expense", "refund", "income"]),
    category: z.string(),
    subcategory: z.string().optional(),
  }),
  z.strictObject({
    ...common,
    type: z.literal("transfer"),
    toAccount: z.string(),
    // Within one currency, the amount sent is the amount received.
    toAmount: minorUnits.optional(),
  }),
]);

// Amounts are integers in each currency's minor units (ADR 0010).
export const importFile = z
  .strictObject({
    accounts: z.array(account).min(1),
    categories: z.array(category).default([]),
    transactions: z.array(transaction),
  })
  .superRefine((file, context) => {
    const accounts = new Map(file.accounts.map((a) => [nameKey(a.name), a]));
    if (accounts.size !== file.accounts.length) {
      context.addIssue({ code: "custom", path: ["accounts"], message: "Account names repeat" });
    }
    const categories = new Set<string>();
    const addCategory = (path: (string | number)[], key: string, name: string) => {
      if (categories.has(key))
        context.addIssue({ code: "custom", path, message: `${name} repeats` });
      categories.add(key);
    };
    file.categories.forEach((c, i) => {
      addCategory(
        ["categories", i],
        categoryKey(c.kind, c.name),
        `The ${c.kind} category ${c.name}`,
      );
      c.subcategories.forEach((s, j) => {
        addCategory(
          ["categories", i, "subcategories", j],
          categoryKey(c.kind, c.name, s.name),
          `${c.name} › ${s.name}`,
        );
      });
    });

    file.transactions.forEach((t, i) => {
      const issue = (message: string) =>
        context.addIssue({ code: "custom", path: ["transactions", i], message });
      const from = accounts.get(nameKey(t.account));
      if (!from) issue(`No account named "${t.account}" in the file`);

      switch (t.type) {
        case "expense":
        case "refund":
        case "income":
          if (!categories.has(categoryKey(kindFor(t.type), t.category, t.subcategory))) {
            const name = t.subcategory ? `${t.category} › ${t.subcategory}` : t.category;
            issue(`No ${kindFor(t.type)} category named "${name}" in the file`);
          }
          break;
        case "transfer": {
          const to = accounts.get(nameKey(t.toAccount));
          if (!to) issue(`No account named "${t.toAccount}" in the file`);
          if (sameName(t.toAccount, t.account)) issue("A transfer needs two different accounts");
          if (from && to && from.currency !== to.currency && t.toAmount === undefined) {
            issue("A transfer between currencies needs toAmount");
          }
          if (
            from &&
            to &&
            from.currency === to.currency &&
            (t.toAmount ?? t.amount) !== t.amount
          ) {
            issue("A transfer within one currency receives what it sends: toAmount isn't amount");
          }
          break;
        }
      }
    });
  });

export type ImportFile = z.infer<typeof importFile>;
type Account = ImportFile["accounts"][number];
type Category = ImportFile["categories"][number];
type CategorySpec = z.infer<typeof categorySpec>;
type Transaction = ImportFile["transactions"][number];
type Kind = Category["kind"];
