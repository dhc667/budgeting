import { readFileSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createInviteCode } from "../../cli/invites.ts";
import type { Database } from "../../src/supabase/database.ts";
import {
  admin,
  anonClient,
  createSpace,
  defined,
  password,
  privateSpaceOf,
  signedInUser,
  sql,
  uniqueEmail,
  type SignedInUser as User,
} from "../support/local-instance.ts";
import type { Enums } from "../../src/supabase/database.types.ts";

afterAll(() => sql.end());

describe("starter categories", () => {
  it("come with a new private space, in the language the app showed at signup", async () => {
    const ana = await signedInUser("Ana", "es-419");
    const privateSpace = await privateSpaceOf(ana);

    const categories = await categoriesOf(ana, privateSpace.id);

    expect(namesByKind(categories)).toEqual({
      expense: [
        "Comer afuera",
        "Compras",
        "Cuentas y servicios",
        "Educación",
        "Entretenimiento",
        "Hogar",
        "Otros",
        "Regalos",
        "Salud",
        "Supermercado",
        "Transporte",
        "Viajes",
      ],
      income: ["Intereses e inversiones", "Otros", "Regalos", "Sueldo"],
    });
    expect(categories.every(({ parent_id }) => parent_id === null)).toBe(true);
    expect(categories.find(({ name }) => name === "Supermercado")).toMatchObject({
      icon: "shopping-cart",
      color: "green",
    });
  });

  it("come with a new shared space, in the language its creator asked for", async () => {
    const [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
    const familyId = await createSpace(ana, "Família", [ben], "pt-BR");

    const categories = await categoriesOf(ben, familyId);

    expect(namesByKind(categories).income).toEqual([
      "Juros e investimentos",
      "Outros",
      "Presentes",
      "Salário",
    ]);
  });

  it("are in English when signup names no language the app knows", async () => {
    const client = anonClient();
    const { data } = await client.auth.signUp({
      email: uniqueEmail(),
      password,
      options: {
        data: {
          invite_code: await createInviteCode(admin, 24),
          display_name: "Ana",
          language: "xx",
        },
      },
    });
    const ana = { client, userId: defined(data.user).id };

    const categories = await categoriesOf(ana, (await privateSpaceOf(ana)).id);

    expect(namesByKind(categories).income).toEqual([
      "Gifts",
      "Interest & investments",
      "Other",
      "Salary",
    ]);
  });

  it("aren't listed as added in the space's activity", async () => {
    const ana = await signedInUser("Ana");
    const privateId = (await privateSpaceOf(ana)).id;
    const familyId = await createSpace(ana, "Family", []);

    for (const spaceId of [privateId, familyId]) {
      expect(await categoriesOf(ana, spaceId)).not.toEqual([]);
      expect(await categoryActivityOf(ana, spaceId)).toEqual([]);
    }
  });

  it("reach spaces that existed before categories, in their creator's language", async () => {
    const [ana, ben, carla] = await Promise.all([
      signedInUser("Ana"),
      signedInUser("Ben"),
      signedInUser("Carla"),
    ]);
    const anaPrivate = (await privateSpaceOf(ana)).id;
    const familyId = await createSpace(ben, "Family", [ana]);
    const clubId = await createSpace(carla, "Club", [ana], "pt-BR");
    await chooseLanguage(ana, "pt-BR");
    await chooseLanguage(ben, "es-419");
    const spaces = [anaPrivate, familyId, clubId];

    const { salaryIn, activityAdded } = await rolledBack(async (tx) => {
      await tx`
        delete from ledger_accounts
        where space_id in ${tx(spaces)} and kind in ('expense', 'income')`;
      const activityBefore = await activityCount(tx, spaces);
      await tx.unsafe(readFileSync(backfillMigration, "utf8"));
      const rows = await tx<{ space_id: string; name: string }[]>`
        select space_id, name from ledger_accounts
        where space_id in ${tx(spaces)} and icon = 'briefcase'`;
      return {
        salaryIn: Object.fromEntries(rows.map(({ space_id, name }) => [space_id, name])),
        activityAdded: (await activityCount(tx, spaces)) - activityBefore,
      };
    });

    expect(salaryIn).toEqual({ [anaPrivate]: "Salário", [familyId]: "Sueldo", [clubId]: "Salary" });
    expect(activityAdded).toBe(0);
  });
});

describe("nesting", () => {
  let ana: User;
  let ben: User;
  let familyId: string;

  beforeEach(async () => {
    [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
    familyId = await createSpace(ana, "Family", [ben]);
  });

  it("puts subcategories under a parent, and transactions in either", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const bakery = await addCategory(ben, familyId, { category_name: "Bakery", parent: food });
    const account = await addAccount(ana, familyId);

    await recordTransaction(ana, account, food, 500);
    await recordTransaction(ana, account, bakery, 300);

    expect(await categoryOf(ana, bakery)).toMatchObject({ parent_id: food, transaction_count: 1 });
    expect(await categoryOf(ana, food)).toMatchObject({ parent_id: null, transaction_count: 1 });
  });

  it("gives a subcategory its parent's kind", async () => {
    const sideJobs = await addCategory(ana, familyId, {
      category_name: "Side jobs",
      category_kind: "income",
    });

    const tips = await addCategory(ana, familyId, {
      category_name: "Tips",
      category_kind: "expense",
      parent: sideJobs,
    });
    await updateCategory(ana, tips, { category_kind: "expense", parent: sideJobs });

    expect(await categoryOf(ana, tips)).toMatchObject({ kind: "income" });
  });

  it("moves a subcategory under a parent of the other kind, which it takes", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const sideJobs = await addCategory(ana, familyId, {
      category_name: "Side jobs",
      category_kind: "income",
    });
    const tips = await addCategory(ana, familyId, { category_name: "Tips", parent: food });

    const { error } = await updateCategory(ana, tips, { category_name: "Tips", parent: sideJobs });

    expect(error).toBeNull();
    expect(await categoryOf(ana, tips)).toMatchObject({ parent_id: sideJobs, kind: "income" });
  });

  it("moves a subcategory up to the top level", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const bakery = await addCategory(ana, familyId, { category_name: "Bakery", parent: food });

    await updateCategory(ana, bakery, { category_name: "Bakery", parent: null });

    expect(await categoryOf(ana, bakery)).toMatchObject({ parent_id: null, kind: "expense" });
  });

  it("changes a top-level category's kind together with its subcategories'", async () => {
    const gifts = await addCategory(ana, familyId, { category_name: "Gifts" });
    const birthdays = await addCategory(ana, familyId, {
      category_name: "Birthdays",
      parent: gifts,
    });

    await updateCategory(ana, gifts, { category_name: "Gifts", category_kind: "income" });

    expect(await categoryOf(ana, birthdays)).toMatchObject({ kind: "income", parent_id: gifts });
  });

  it("goes one level deep", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const bakery = await addCategory(ana, familyId, { category_name: "Bakery", parent: food });
    const bread = await addCategory(ana, familyId, { category_name: "Bread" });

    const deeper = await ana.client.rpc("create_category", {
      ...newCategory(familyId),
      parent: bakery,
    });
    const parentUnderOther = await updateCategory(ana, food, { parent: bread });
    const ownParent = await updateCategory(ana, bread, { parent: bread });

    expect(deeper.error?.message).toMatch(/one level deep/);
    expect(parentUnderOther.error?.message).toMatch(/with subcategories can't become one/);
    expect(ownParent.error?.message).toMatch(/one level deep/);
  });

  it("keeps a subcategory in its parent's space", async () => {
    const elsewhere = await addCategory(ana, (await privateSpaceOf(ana)).id, {
      category_name: "Food",
    });

    const { error } = await ana.client.rpc("create_category", {
      ...newCategory(familyId),
      parent: elsewhere,
    });

    expect(error?.message).toMatch(/parent's space/);
  });

  it("nests categories alone", async () => {
    const account = await addAccount(ana, familyId);
    const food = await addCategory(ana, familyId, { category_name: "Food" });

    const underAccount = await ana.client.rpc("create_category", {
      ...newCategory(familyId),
      parent: account,
    });
    const movedUnderAccount = await updateCategory(ana, food, { parent: account });

    expect(underAccount.error?.message).toMatch(/only categories nest/);
    expect(movedUnderAccount.error?.message).toMatch(/only categories nest/);
  });

  it("refuses a parent that doesn't exist", async () => {
    const { error } = await ana.client.rpc("create_category", {
      ...newCategory(familyId),
      parent: crypto.randomUUID(),
    });

    expect(error?.message).toMatch(/no such parent category/);
  });

  it("lets one of two categories moved under each other at once win", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const drinks = await addCategory(ana, familyId, { category_name: "Drinks" });

    const attempts = await Promise.all([
      updateCategory(ana, food, { category_name: "Food", parent: drinks }),
      updateCategory(ben, drinks, { category_name: "Drinks", parent: food }),
    ]);

    const errors = attempts.flatMap(({ error }) => (error ? [error.message] : []));
    expect(errors).toEqual([
      expect.stringMatching(/one level deep|subcategories can't become one/),
    ]);
  });

  it("allows duplicate names", async () => {
    const first = await addCategory(ana, familyId, { category_name: "Food" });
    const second = await addCategory(ana, familyId, { category_name: "Food" });

    expect(first).not.toEqual(second);
  });
});

describe("editing a category", () => {
  let ana: User;
  let ben: User;
  let carla: User;
  let familyId: string;

  beforeEach(async () => {
    [ana, ben, carla] = await Promise.all([
      signedInUser("Ana"),
      signedInUser("Ben"),
      signedInUser("Carla"),
    ]);
    familyId = await createSpace(ana, "Family", [ben]);
  });

  it("changes its name, icon and color, and records it in the space's activity", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });

    await updateCategory(ben, food, {
      category_name: "Groceries",
      category_icon: "apple",
      category_color: "lime",
    });

    expect(await categoryOf(ana, food)).toMatchObject({
      name: "Groceries",
      icon: "apple",
      color: "lime",
    });
    expect(await categoryActivityOf(ana, familyId)).toMatchObject([
      { action: "insert", row_id: food, changed_by: ana.userId },
      {
        action: "update",
        row_id: food,
        changed_by: ben.userId,
        old: { name: "Food" },
        new: { name: "Groceries" },
      },
    ]);
  });

  it("refuses a blank name", async () => {
    const { error } = await ana.client.rpc("create_category", {
      ...newCategory(familyId),
      category_name: "  ",
    });

    expect(error).not.toBeNull();
  });

  it("works on categories alone, never on accounts or opening balances", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const account = await addAccount(ana, familyId);
    const otherAccount = await addAccount(ana, familyId);
    const openingBalance = await openingBalanceCategoryOf(familyId);
    await recordTransaction(ana, account, food, 500);

    const kindRefusals = [
      await ana.client.rpc("create_category", {
        ...newCategory(familyId),
        category_kind: "account",
      }),
      await ana.client.rpc("create_category", {
        ...newCategory(familyId),
        category_kind: "opening_balance",
      }),
      await updateCategory(ana, food, { category_kind: "account" }),
    ];
    const notCategories = [
      await updateCategory(ana, account, { category_name: "Hijacked" }),
      await updateCategory(ana, openingBalance, { category_name: "Hijacked" }),
      await ana.client.rpc("delete_category", { category_id: account, move_to: otherAccount }),
      await ana.client.rpc("delete_category", { category_id: openingBalance, move_to: null }),
    ];

    expect(kindRefusals.map(({ error }) => error?.message)).toEqual(
      Array(3).fill(expect.stringMatching(/for expenses or income/)),
    );
    expect(notCategories.map(({ error }) => error?.message)).toEqual(
      Array(4).fill(expect.stringMatching(/no such category/)),
    );
    const { data } = await ana.client
      .from("accounts")
      .select("id, name, has_transactions")
      .eq("id", account);
    expect(data).toEqual([{ id: account, name: "Checking", has_transactions: true }]);
  });

  it("is only for members of its space, who alone see its categories", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });

    const added = await carla.client.rpc("create_category", newCategory(familyId));
    const edited = await updateCategory(carla, food, { category_name: "Hijacked" });
    const seen = await carla.client.from("categories").select("id").eq("space_id", familyId);

    expect(added.error).not.toBeNull();
    expect(edited.error).not.toBeNull();
    expect(seen.data).toEqual([]);
    expect(await categoryOf(ana, food)).toMatchObject({ name: "Food" });
  });

  it("can't be done by writing the table directly", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });

    await ana.client.from("ledger_accounts").update({ name: "Hijacked" }).eq("id", food);
    await ana.client.from("ledger_accounts").delete().eq("id", food);

    expect(await categoryOf(ana, food)).toMatchObject({ name: "Food" });
  });
});

describe("deleting a category", () => {
  let ana: User;
  let ben: User;
  let carla: User;
  let familyId: string;
  let account: string;

  beforeEach(async () => {
    [ana, ben, carla] = await Promise.all([
      signedInUser("Ana"),
      signedInUser("Ben"),
      signedInUser("Carla"),
    ]);
    familyId = await createSpace(ana, "Family", [ben]);
    account = await addAccount(ana, familyId);
  });

  it("deletes one without transactions", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });

    const { error } = await ben.client.rpc("delete_category", { category_id: food, move_to: null });

    expect(error).toBeNull();
    const { data } = await ana.client.from("categories").select("id").eq("id", food);
    expect(data).toEqual([]);
    const entry = (await categoryActivityOf(ana, familyId)).at(-1);
    expect(entry).toMatchObject({
      action: "delete",
      row_id: food,
      changed_by: ben.userId,
      old: { name: "Food" },
      new: null,
    });
    expect(entry?.old).not.toHaveProperty("moved_to");
  });

  it("moves its transactions to the category chosen, recording one entry that says where", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const groceries = await addCategory(ana, familyId, { category_name: "Groceries" });
    await recordTransaction(ana, account, food, 500);
    await recordTransaction(ana, account, food, 200);
    const transactionActivityBefore = await transactionActivityCount(ana, familyId);

    const { error } = await ben.client.rpc("delete_category", {
      category_id: food,
      move_to: groceries,
    });

    expect(error).toBeNull();
    expect(await categoryOf(ana, groceries)).toMatchObject({ transaction_count: 2 });
    const entries = await categoryActivityOf(ana, familyId);
    expect(entries.at(-1)).toMatchObject({
      action: "delete",
      row_id: food,
      changed_by: ben.userId,
      old: { name: "Food", moved_to: { id: groceries, name: "Groceries" }, moved_transactions: 2 },
      new: null,
    });
    expect(await transactionActivityCount(ana, familyId)).toBe(transactionActivityBefore);
  });

  it("moves a subcategory's transactions to its parent", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const bakery = await addCategory(ana, familyId, { category_name: "Bakery", parent: food });
    await recordTransaction(ana, account, bakery, 300);

    await ana.client.rpc("delete_category", { category_id: bakery, move_to: food });

    expect(await categoryOf(ana, food)).toMatchObject({ transaction_count: 1 });
  });

  it("refuses to move its transactions anywhere but another category of its kind in its space", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const salary = await addCategory(ana, familyId, {
      category_name: "Salary",
      category_kind: "income",
    });
    const elsewhere = await addCategory(ana, (await privateSpaceOf(ana)).id, {
      category_name: "Food",
    });
    await recordTransaction(ana, account, food, 500);

    const attempts = await Promise.all(
      [salary, elsewhere, food, null].map((move_to) =>
        ana.client.rpc("delete_category", { category_id: food, move_to }),
      ),
    );

    expect(attempts.map(({ error }) => error?.message)).toEqual(
      Array(4).fill(expect.stringMatching(/another of its kind in its space/)),
    );
    expect(await categoryOf(ana, food)).toMatchObject({ transaction_count: 1 });
  });

  it("lets one of two categories deleted into each other at once go", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    const groceries = await addCategory(ana, familyId, { category_name: "Groceries" });
    await recordTransaction(ana, account, food, 500);
    await recordTransaction(ana, account, groceries, 200);

    const attempts = await Promise.all([
      ana.client.rpc("delete_category", { category_id: food, move_to: groceries }),
      ben.client.rpc("delete_category", { category_id: groceries, move_to: food }),
    ]);

    const errors = attempts.flatMap(({ error }) => (error ? [error.message] : []));
    expect(errors).toEqual([expect.stringMatching(/another of its kind in its space/)]);
    const { data } = await ana.client
      .from("categories")
      .select("transaction_count")
      .in("id", [food, groceries]);
    expect(data).toEqual([{ transaction_count: 2 }]);
  });

  it("goes with its space, subcategories and all", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    await addCategory(ana, familyId, { category_name: "Bakery", parent: food });

    const { error } = await ben.client.from("spaces").delete().eq("id", familyId);

    expect(error).toBeNull();
    const { data } = await ben.client.from("spaces").select("id").eq("id", familyId);
    expect(data).toEqual([]);
  });

  it("refuses a parent that still has subcategories", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });
    await addCategory(ana, familyId, { category_name: "Bakery", parent: food });

    const { error } = await ana.client.rpc("delete_category", { category_id: food, move_to: null });

    expect(error?.message).toMatch(/with subcategories can't be deleted/);
  });

  it("is only for members of its space", async () => {
    const food = await addCategory(ana, familyId, { category_name: "Food" });

    const { error } = await carla.client.rpc("delete_category", {
      category_id: food,
      move_to: null,
    });

    expect(error).not.toBeNull();
    expect(await categoryOf(ana, food)).toMatchObject({ name: "Food" });
  });
});

const backfillMigration = new URL(
  "../../db/migrations/0016_starter_categories_for_existing_spaces.sql",
  import.meta.url,
);

async function addCategory(
  user: User,
  spaceId: string,
  details: Partial<CategoryDetails>,
): Promise<string> {
  const { data, error } = await user.client.rpc("create_category", {
    ...newCategory(spaceId),
    ...details,
  });
  if (error) throw error;
  return data;
}

// Every detail but the one changed stays as newCategory made it.
function updateCategory(user: User, categoryId: string, changes: Partial<CategoryDetails>) {
  return user.client.rpc("update_category", {
    category_id: categoryId,
    ...categoryDetails(),
    ...changes,
  });
}

function newCategory(spaceId: string) {
  return { space: spaceId, ...categoryDetails() };
}

function categoryDetails(): CategoryDetails {
  return {
    category_name: "Food",
    category_kind: "expense",
    category_icon: "utensils",
    category_color: "orange",
    parent: null,
  };
}

type CategoryDetails = Omit<
  Database["public"]["Functions"]["update_category"]["Args"],
  "category_id"
>;

async function categoryOf(user: User, categoryId: string) {
  const { data, error } = await user.client
    .from("categories")
    .select("*")
    .eq("id", categoryId)
    .single();
  if (error) throw error;
  return data;
}

async function categoriesOf(user: User, spaceId: string) {
  const { data, error } = await user.client
    .from("categories")
    .select("*")
    .eq("space_id", spaceId)
    .order("name");
  if (error) throw error;
  return data;
}

function namesByKind(categories: { kind: string; name: string }[]) {
  const namesOf = (kind: string) =>
    categories.filter((category) => category.kind === kind).map(({ name }) => name);
  return { expense: namesOf("expense"), income: namesOf("income") };
}

async function categoryActivityOf(user: User, spaceId: string) {
  const { data, error } = await user.client
    .from("activity")
    .select("action, row_id, changed_by, old, new")
    .eq("space_id", spaceId)
    .eq("table_name", "ledger_accounts")
    .order("id");
  if (error) throw error;
  return data;
}

async function transactionActivityCount(user: User, spaceId: string): Promise<number> {
  const { count, error } = await user.client
    .from("activity")
    .select("id", { count: "exact", head: true })
    .eq("space_id", spaceId)
    .eq("table_name", "transactions");
  if (error) throw error;
  return defined(count);
}

async function addAccount(user: User, spaceId: string): Promise<string> {
  const { data, error } = await user.client.rpc("create_account", {
    space: spaceId,
    account_name: "Checking",
    account_currency: "USD",
    account_color: "blue",
    opening_amount: 0,
    opening_date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data;
}

async function recordTransaction(user: User, account: string, category: string, amount: number) {
  const { error } = await user.client.rpc("add_transaction", {
    transaction_id: crypto.randomUUID(),
    transaction_type: "expense",
    transaction_date: new Date().toISOString().slice(0, 10),
    title: null,
    note: null,
    account,
    amount,
    category,
    to_account: null,
    to_amount: null,
  });
  if (error) throw error;
}

// Members never see a space's opening-balance category, so this reads it as the database's owner.
async function openingBalanceCategoryOf(spaceId: string): Promise<string> {
  const [found] = await sql<{ id: string }[]>`
    select id from ledger_accounts where space_id = ${spaceId} and kind = 'opening_balance'`;
  return defined(found).id;
}

async function chooseLanguage(user: User, language: Enums<"language">) {
  const { error } = await user.client.from("profiles").update({ language }).eq("id", user.userId);
  if (error) throw error;
}

async function activityCount(tx: TransactionSql, spaceIds: string[]): Promise<number> {
  const [counted] = await tx<{ count: number }[]>`
    select count(*)::int as count from activity where space_id in ${tx(spaceIds)}`;
  return defined(counted).count;
}

async function rolledBack<T>(work: (tx: TransactionSql) => Promise<T>) {
  const rollback = new Error("rollback");
  let result: T | undefined;
  await sql
    .begin(async (tx) => {
      result = await work(tx);
      throw rollback;
    })
    .catch((error: unknown) => {
      if (error !== rollback) throw error;
    });
  return defined(result);
}
