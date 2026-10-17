import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/supabase/database.ts";
import {
  createSpace,
  privateSpaceOf,
  signedInUser,
  sql,
  type SignedInUser as User,
} from "../support/local-instance.ts";
import { daysAgo, today } from "../support/dates.ts";

afterAll(() => sql.end());

let ana: User;
let ben: User;
let carla: User;
let familyId: string;
let checking: string;
let groceries: string;
let eatingOut: string;

beforeEach(async () => {
  [ana, ben, carla] = await Promise.all([
    signedInUser("Ana"),
    signedInUser("Ben"),
    signedInUser("Carla"),
  ]);
  familyId = await createSpace(ana, "Family", [ben]);
  checking = await addAccount(ana, familyId, "Checking");
  groceries = await categoryIn(ana, familyId, "Groceries");
  eatingOut = await categoryIn(ana, familyId, "Eating out");
});

describe("a budget", () => {
  it("shows to the members of its space, who can all change and delete it", async () => {
    const id = await createBudget(ana, food());

    expect(await budgetAs(ben, id)).toMatchObject({
      space_id: familyId,
      name: "Food",
      currency: "USD",
      amount: 40_000,
      starts_on: "2026-01-01",
      every: 1,
      unit: "month",
      ends_on: null,
      category_ids: [groceries, eatingOut],
      account_ids: null,
    });
    expect(await budgetAs(carla, id)).toBeNull();

    await expectNoError(ben.client.from("budgets").update({ amount: 45_000 }).eq("id", id));
    expect(await budgetAs(ana, id)).toMatchObject({ amount: 45_000 });
    await expectNoError(ben.client.from("budgets").delete().eq("id", id));
    expect(await budgetAs(ana, id)).toBeNull();
  });

  it("can't be added to, changed in or deleted from a space by someone outside it", async () => {
    const id = await createBudget(ana, food());

    const { error } = await carla.client.from("budgets").insert(food({ category_ids: null }));
    await carla.client.from("budgets").update({ amount: 1 }).eq("id", id);
    await carla.client.from("budgets").delete().eq("id", id);

    expect(error?.code).toBe("42501");
    expect(await budgetAs(ana, id)).toMatchObject({ amount: 40_000 });
  });

  it("stays in its space", async () => {
    const id = await createBudget(ana, food({ category_ids: null }));
    const privateId = (await privateSpaceOf(ana)).id;

    const { error } = await ana.client.from("budgets").update({ space_id: privateId }).eq("id", id);

    expect(error?.code).toBe("42501");
  });

  it("covers only expense categories and accounts of its own space", async () => {
    const privateId = (await privateSpaceOf(ana)).id;
    const otherAccount = await addAccount(ana, privateId, "Wallet");
    const otherCategory = await categoryIn(ana, privateId, "Groceries");
    const salary = await categoryIn(ana, familyId, "Salary");

    const refusals = await Promise.all([
      ana.client.from("budgets").insert(food({ category_ids: [otherCategory] })),
      ana.client.from("budgets").insert(food({ category_ids: [salary] })),
      ana.client.from("budgets").insert(food({ account_ids: [otherAccount] })),
      ana.client.from("budgets").insert(food({ account_ids: [groceries] })),
    ]);

    expect(refusals.map(({ error }) => error?.message)).toEqual([
      "a budget covers expense categories of its own space",
      "a budget covers expense categories of its own space",
      "a budget covers accounts of its own space",
      "a budget covers accounts of its own space",
    ]);
  });

  it("is either repeating or a fixed range, with carry-over only when repeating", async () => {
    const refusals = await Promise.all([
      ana.client.from("budgets").insert(food({ ends_on: "2026-03-01" })),
      ana.client.from("budgets").insert(food({ every: null, unit: null })),
      ana.client
        .from("budgets")
        .insert(food({ every: null, unit: null, ends_on: "2026-03-01", carry_unspent: true })),
    ]);

    expect(refusals.map(({ error }) => error?.code)).toEqual(["23514", "23514", "23514"]);
  });
});

describe("what a budget spent", () => {
  it("is what went into its categories, less refunds, by day and currency", async () => {
    const id = await createBudget(ana, food({ starts_on: daysAgo(10) }));
    await record(ana, "expense", checking, groceries, 3_000, daysAgo(2));
    await record(ben, "expense", checking, eatingOut, 1_500, daysAgo(2));
    await record(ana, "refund", checking, groceries, 500, daysAgo(1));
    await record(ana, "expense", checking, await categoryIn(ana, familyId, "Transport"), 900);
    await record(ana, "expense", checking, groceries, 700, daysAgo(11));

    expect(await spendingOf(ben, id)).toEqual([
      { spent_on: daysAgo(2), currency: "USD", amount: 4_500 },
      { spent_on: daysAgo(1), currency: "USD", amount: -500 },
    ]);
    expect(await spendingOf(carla, id)).toEqual([]);
  });

  it("counts a chosen parent's subcategories", async () => {
    const supermarket = await addSubcategory(ana, groceries, "Supermarket");
    const id = await createBudget(ana, food({ category_ids: [groceries], starts_on: today() }));
    await record(ana, "expense", checking, supermarket, 2_000);

    expect(await spendingOf(ana, id)).toEqual([
      { spent_on: today(), currency: "USD", amount: 2_000 },
    ]);
  });

  it("counts every expense category in its space when none were chosen", async () => {
    const id = await createBudget(ana, food({ category_ids: null, starts_on: today() }));
    await record(ana, "expense", checking, groceries, 2_000);
    await record(ana, "expense", checking, await categoryIn(ana, familyId, "Transport"), 900);
    await record(ana, "income", checking, await categoryIn(ana, familyId, "Salary"), 50_000);

    expect(await spendingOf(ana, id)).toEqual([
      { spent_on: today(), currency: "USD", amount: 2_900 },
    ]);
  });

  it("counts only its chosen accounts, in their own currencies", async () => {
    const card = await addAccount(ana, familyId, "Card", "EUR");
    const id = await createBudget(
      ana,
      food({ account_ids: [card], category_ids: null, starts_on: today() }),
    );
    await record(ana, "expense", checking, groceries, 2_000);
    await record(ana, "expense", card, groceries, 1_200);

    expect(await spendingOf(ana, id)).toEqual([
      { spent_on: today(), currency: "EUR", amount: 1_200 },
    ]);
  });

  it("stops at a fixed range's end", async () => {
    const id = await createBudget(
      ana,
      food({ every: null, unit: null, starts_on: daysAgo(5), ends_on: daysAgo(2) }),
    );
    await record(ana, "expense", checking, groceries, 2_000, daysAgo(3));
    await record(ana, "expense", checking, groceries, 900, daysAgo(1));

    expect(await spendingOf(ana, id)).toEqual([
      { spent_on: daysAgo(3), currency: "USD", amount: 2_000 },
    ]);
  });
});

describe("leaving a transaction out of a budget", () => {
  it("takes it out of what that budget spent only, until it's counted again", async () => {
    const food1 = await createBudget(ana, food({ starts_on: today() }));
    const food2 = await createBudget(ana, food({ name: "Everything", starts_on: today() }));
    const vet = await record(ana, "expense", checking, groceries, 9_000);

    await excludeFrom(ben, vet, [food1]);
    expect(await spendingOf(ana, food1)).toEqual([]);
    expect(await spendingOf(ana, food2)).toHaveLength(1);
    expect(await exclusionsOf(ana, vet)).toEqual([food1]);

    await excludeFrom(ben, vet, []);
    expect(await spendingOf(ana, food1)).toHaveLength(1);
    expect(await exclusionsOf(ana, vet)).toEqual([]);
  });

  it("is logged on the budget, naming the transaction", async () => {
    const id = await createBudget(ana, food({ starts_on: today() }));
    const vet = await record(ana, "expense", checking, groceries, 9_000, today(), null);

    await excludeFrom(ben, vet, [id]);
    await excludeFrom(ben, vet, [id]);
    await excludeFrom(ana, vet, []);

    const history = await historyOf(ana, id);
    expect(history.map(({ action, changed_by }) => ({ action, changed_by }))).toEqual([
      { action: "update", changed_by: ana.userId },
      { action: "update", changed_by: ben.userId },
      { action: "insert", changed_by: ana.userId },
    ]);
    expect(history[0]?.new).toMatchObject({ included: { id: vet, title: "Groceries" } });
    expect(history[1]?.new).toMatchObject({ excluded: { id: vet, title: "Groceries" } });
  });

  it("is only for budgets of the transaction's spaces that the caller is in", async () => {
    const privateId = (await privateSpaceOf(ana)).id;
    const own = await createBudget(ana, food({ category_ids: null, space_id: privateId }));
    const family = await createBudget(ana, food());
    const vet = await record(ana, "expense", checking, groceries, 9_000);

    const refusals = await Promise.all([
      ana.client.rpc("set_budget_exclusions", { transaction_id: vet, budget_ids: [own] }),
      carla.client.rpc("set_budget_exclusions", { transaction_id: vet, budget_ids: [family] }),
    ]);

    expect(refusals.map(({ error }) => error?.message)).toEqual([
      "a transaction is left out only of budgets in its spaces",
      "no such transaction in your spaces",
    ]);
  });
});

describe("a budget's categories and accounts", () => {
  it("follow a deleted category's transactions to where they moved", async () => {
    const id = await createBudget(ana, food({ category_ids: [eatingOut] }));
    await record(ana, "expense", checking, eatingOut, 1_000);

    await expectNoError(
      ana.client.rpc("delete_category", { category_id: eatingOut, move_to: groceries }),
    );

    expect(await budgetAs(ana, id)).toMatchObject({ category_ids: [groceries] });
  });

  it("lose a deleted account, and cover nothing rather than everything once none is left", async () => {
    const card = await addAccount(ana, familyId, "Card");
    const id = await createBudget(ana, food({ account_ids: [card] }));

    await expectNoError(ana.client.from("accounts").delete().eq("id", card));

    expect(await budgetAs(ana, id)).toMatchObject({ account_ids: [] });
  });
});

describe("a budget's history", () => {
  it("shows who created and changed it, to members of its space", async () => {
    const id = await createBudget(ana, food());
    await expectNoError(ben.client.from("budgets").update({ name: "Eating" }).eq("id", id));

    const history = await historyOf(ana, id);

    expect(history.map(({ action, changed_by }) => ({ action, changed_by }))).toEqual([
      { action: "update", changed_by: ben.userId },
      { action: "insert", changed_by: ana.userId },
    ]);
    expect(history[0]?.old).toMatchObject({ name: "Food" });
    expect(await historyOf(carla, id)).toEqual([]);
  });
});

type BudgetInsert = Database["public"]["Tables"]["budgets"]["Insert"];

function food(overrides: Partial<BudgetInsert> = {}): BudgetInsert {
  return {
    space_id: familyId,
    name: "Food",
    currency: "USD",
    amount: 40_000,
    starts_on: "2026-01-01",
    every: 1,
    unit: "month",
    category_ids: [groceries, eatingOut],
    ...overrides,
  };
}

async function createBudget(user: User, budget: BudgetInsert): Promise<string> {
  const { data, error } = await user.client.from("budgets").insert(budget).select("id").single();
  if (error) throw error;
  return data.id;
}

async function budgetAs(user: User, id: string) {
  const { data, error } = await user.client.from("budgets").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function spendingOf(user: User, id: string) {
  const { data, error } = await user.client.rpc("budget_spending", { budget_id: id });
  if (error) throw error;
  return data;
}

async function excludeFrom(user: User, transactionId: string, budgetIds: string[]) {
  await expectNoError(
    user.client.rpc("set_budget_exclusions", {
      transaction_id: transactionId,
      budget_ids: budgetIds,
    }),
  );
}

async function exclusionsOf(user: User, transactionId: string): Promise<string[]> {
  const { data, error } = await user.client
    .from("budget_exclusions")
    .select("budget_id")
    .eq("transaction_id", transactionId);
  if (error) throw error;
  return data.map(({ budget_id }) => budget_id);
}

async function historyOf(user: User, id: string) {
  const { data, error } = await user.client.rpc("budget_history", { budget_id: id });
  if (error) throw error;
  return data;
}

async function record(
  user: User,
  type: "expense" | "refund" | "income",
  account: string,
  category: string,
  amount: number,
  date = today(),
  title: string | null = "Bought something",
): Promise<string> {
  const id = crypto.randomUUID();
  await expectNoError(
    user.client.rpc("add_transaction", {
      transaction_id: id,
      transaction_type: type,
      transaction_date: date,
      title,
      note: null,
      account,
      amount,
      category,
      to_account: null,
      to_amount: null,
    }),
  );
  return id;
}

async function addAccount(
  user: User,
  spaceId: string,
  name: string,
  currency = "USD",
): Promise<string> {
  const { data, error } = await user.client.rpc("create_account", {
    space: spaceId,
    account_name: name,
    account_currency: currency,
    account_color: "blue",
    opening_amount: 0,
    opening_date: today(),
  });
  if (error) throw error;
  return data;
}

async function categoryIn(user: User, spaceId: string, name: string): Promise<string> {
  const { data, error } = await user.client
    .from("categories")
    .select("id")
    .eq("space_id", spaceId)
    .eq("name", name)
    .single();
  if (error) throw error;
  return data.id;
}

async function addSubcategory(user: User, parent: string, name: string): Promise<string> {
  const { data, error } = await user.client.rpc("create_category", {
    space: familyId,
    category_kind: "expense",
    category_name: name,
    category_icon: "shopping-cart",
    category_color: "green",
    parent,
  });
  if (error) throw error;
  return data;
}

async function expectNoError(call: PromiseLike<{ error: unknown }>) {
  const { error } = await call;
  expect(error).toBeNull();
}
