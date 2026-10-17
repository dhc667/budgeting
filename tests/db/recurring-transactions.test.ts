import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/supabase/database.ts";
import {
  createSpace,
  defined,
  privateSpaceOf,
  signedInUser,
  sql,
  type SignedInUser as User,
} from "../support/local-instance.ts";
import { daysAgo, today } from "../support/dates.ts";

afterAll(() => sql.end());

const permissionDenied = "42501";

let ana: User;
let ben: User;
let carla: User;
let familyId: string;
let checking: string;
let bills: string;

beforeEach(async () => {
  [ana, ben, carla] = await Promise.all([
    signedInUser("Ana"),
    signedInUser("Ben"),
    signedInUser("Carla"),
  ]);
  familyId = await createSpace(ana, "Family", [ben]);
  checking = await addAccount(ana, familyId, "Checking", 100_000);
  bills = await categoryIn(ana, familyId, "Bills & utilities");
});

describe("creating a recurring transaction", () => {
  it("records nothing, and shows the rule to the members of its space", async () => {
    const id = await createRule(ana, rent({ title: "  Rent  " }));

    expect(await balanceOf(ana, checking)).toBe(100_000);
    expect(await ruleAs(ben, id)).toMatchObject({
      space_id: familyId,
      type: "expense",
      title: "Rent",
      note: null,
      account_id: checking,
      amount: 50_000,
      category_id: bills,
      to_account_id: null,
      to_amount: null,
      starts_on: "2026-01-31",
      every: 1,
      unit: "month",
      ends_on: null,
      times: null,
      done: 0,
      paused: false,
      created_by: ana.userId,
    });
    expect(await ruleAs(carla, id)).toBeNull();
  });

  it("records the first one on the start date when asked, which then counts as done", async () => {
    const id = await createRule(
      ana,
      rent({ title: "Rent", starts_on: today(), record_first: true }),
    );

    expect(await balanceOf(ana, checking)).toBe(50_000);
    expect(await transactionsIn(ana, checking)).toMatchObject([
      { type: "expense", title: "Rent", date: today(), from_amount: 50_000, category_id: bills },
    ]);
    expect(await ruleAs(ana, id)).toMatchObject({ starts_on: today(), done: 1 });
  });

  it("refuses to record the first one in the future, and then keeps no rule", async () => {
    const { error } = await ana.client.rpc(
      "create_recurring_transaction",
      rent({ starts_on: daysAgo(-2), record_first: true }),
    );

    expect(error?.message).toBe("a transaction can't be dated in the future");
    expect(await rulesIn(ana)).toEqual([]);
  });
});

describe("someone outside the space", () => {
  it("can't create, record or skip its recurring transactions", async () => {
    const id = await createRule(ana, rent());

    const calls = await Promise.all([
      carla.client.rpc("create_recurring_transaction", rent()),
      carla.client.rpc("record_recurring_transaction", recording(id, 0)),
      carla.client.rpc("skip_recurring_transaction", {
        recurring_transaction_id: id,
        occurrence: 0,
      }),
    ]);

    expect(calls.map(({ error }) => error?.message)).toEqual([
      "no such account in your spaces",
      "no such recurring transaction in your spaces",
      "no such recurring transaction in your spaces",
    ]);
    expect(await balanceOf(ana, checking)).toBe(100_000);
    expect(await ruleAs(ana, id)).toMatchObject({ done: 0 });
  });
});

describe("a recurring transfer between spaces", () => {
  it("shows only to members of both, as only they can record it", async () => {
    const savings = await addAccount(ana, (await privateSpaceOf(ana)).id, "Savings");
    const id = await createRule(ana, {
      ...rent({ title: "Saving" }),
      transaction_type: "transfer",
      category: null,
      to_account: savings,
    });

    const { error } = await ben.client.rpc("record_recurring_transaction", recording(id, 0));

    expect(await ruleAs(ana, id)).toMatchObject({ to_account_id: savings, category_id: null });
    expect(await ruleAs(ben, id)).toBeNull();
    expect(error?.message).toBe("no such recurring transaction in your spaces");
    expect(await balanceOf(ana, checking)).toBe(100_000);
  });
});

describe("recording an upcoming transaction", () => {
  it("records it with the amount and date given, and moves the rule on", async () => {
    const id = await createRule(ana, rent({ title: "Electricity", amount: 8_000 }));

    const { error } = await ben.client.rpc("record_recurring_transaction", {
      recurring_transaction_id: id,
      occurrence: 0,
      transaction_date: daysAgo(1),
      amount: 9_250,
      to_amount: null,
    });

    expect(error).toBeNull();
    expect(await balanceOf(ana, checking)).toBe(90_750);
    expect(await transactionsIn(ana, checking)).toMatchObject([
      {
        type: "expense",
        title: "Electricity",
        date: daysAgo(1),
        from_amount: 9_250,
        category_id: bills,
        created_by: ben.userId,
      },
    ]);
    expect(await ruleAs(ana, id)).toMatchObject({ amount: 8_000, done: 1 });
  });

  it("refuses one already recorded or skipped, so two members can't record it twice", async () => {
    const id = await createRule(ana, rent());
    await record(ana, id, 0);

    const { error } = await ben.client.rpc("record_recurring_transaction", recording(id, 0));

    expect(error?.message).toBe("this upcoming transaction was already recorded or skipped");
    expect(await balanceOf(ana, checking)).toBe(50_000);
    expect(await ruleAs(ana, id)).toMatchObject({ done: 1 });
  });
});

describe("skipping an upcoming transaction", () => {
  it("moves the rule on and records nothing", async () => {
    const id = await createRule(ana, rent());

    const { error } = await ben.client.rpc("skip_recurring_transaction", {
      recurring_transaction_id: id,
      occurrence: 0,
    });

    expect(error).toBeNull();
    expect(await balanceOf(ana, checking)).toBe(100_000);
    expect(await transactionsIn(ana, checking)).toEqual([]);
    expect(await ruleAs(ana, id)).toMatchObject({ done: 1 });
  });

  it("refuses one already recorded or skipped", async () => {
    const id = await createRule(ana, rent());
    await record(ana, id, 0);

    const { error } = await ben.client.rpc("skip_recurring_transaction", {
      recurring_transaction_id: id,
      occurrence: 0,
    });

    expect(error?.message).toBe("this upcoming transaction was already recorded or skipped");
    expect(await ruleAs(ana, id)).toMatchObject({ done: 1 });
  });
});

describe("editing a recurring transaction", () => {
  it("changes it, keeps what's done, and logs what it was before", async () => {
    const id = await createRule(ana, rent({ title: "Rent" }));
    await record(ana, id, 0);

    const { error } = await ben.client.rpc(
      "update_recurring_transaction",
      edit(id, { seen_done: 1, title: " New rent ", amount: 55_000 }),
    );

    expect(error).toBeNull();
    expect(await ruleAs(ana, id)).toMatchObject({
      title: "New rent",
      amount: 55_000,
      starts_on: "2026-01-31",
      done: 1,
    });
    const [latest] = await historyOf(ana, id);
    expect(latest).toMatchObject({
      action: "update",
      changed_by: ben.userId,
      old: { title: "Rent", amount: 50_000 },
      new: { title: "New rent", amount: 55_000 },
    });
  });

  it("starts it again from the date it's given when asked", async () => {
    const id = await createRule(ana, rent({ times: 12 }));
    await record(ana, id, 0);
    await record(ana, id, 1);

    await updateRule(
      ana,
      edit(id, {
        seen_done: 2,
        starts_on: "2026-03-31",
        unit: "week",
        times: 10,
        restart: true,
      }),
    );

    expect(await ruleAs(ana, id)).toMatchObject({
      starts_on: "2026-03-31",
      unit: "week",
      times: 10,
      done: 0,
    });
  });

  it("refuses when one was recorded or skipped since it was opened", async () => {
    const id = await createRule(ana, rent());
    await record(ben, id, 0);

    const { error } = await ana.client.rpc(
      "update_recurring_transaction",
      edit(id, { seen_done: 0, starts_on: "2026-03-01", restart: true }),
    );

    expect(error?.message).toBe("this upcoming transaction was already recorded or skipped");
    expect(await ruleAs(ana, id)).toMatchObject({ starts_on: "2026-01-31", done: 1 });
  });
});

describe("pausing a recurring transaction", () => {
  it("keeps its upcoming transaction from being recorded or skipped", async () => {
    const id = await createRule(ana, rent());

    const paused = await ben.client.rpc("pause_recurring_transaction", {
      recurring_transaction_id: id,
    });
    const calls = await Promise.all([
      ana.client.rpc("record_recurring_transaction", recording(id, 0)),
      ana.client.rpc("skip_recurring_transaction", { recurring_transaction_id: id, occurrence: 0 }),
    ]);

    expect(paused.error).toBeNull();
    expect(calls.map(({ error }) => error?.message)).toEqual([
      "this recurring transaction is paused",
      "this recurring transaction is paused",
    ]);
    expect(await ruleAs(ana, id)).toMatchObject({ paused: true, done: 0 });
    const [latest] = await historyOf(ana, id);
    expect(latest).toMatchObject({
      changed_by: ben.userId,
      old: { paused: false },
      new: { paused: true },
    });
  });

  it("resumes from the one the app gives, leaving out those it would have had meanwhile", async () => {
    const id = await createRule(ana, rent());
    await pause(ana, id);

    const { error } = await ben.client.rpc("resume_recurring_transaction", {
      recurring_transaction_id: id,
      seen_done: 0,
      next_occurrence: 3,
    });

    expect(error).toBeNull();
    expect(await ruleAs(ana, id)).toMatchObject({ paused: false, done: 3 });
    const [latest] = await historyOf(ana, id);
    expect(latest).toMatchObject({
      changed_by: ben.userId,
      old: { paused: true, done: 0 },
      new: { paused: false, done: 3 },
    });
  });
});

describe("deleting a recurring transaction", () => {
  it("keeps the transactions it recorded, and logs what it was", async () => {
    const id = await createRule(ana, rent({ title: "Rent" }));
    await record(ana, id, 0);

    const { error } = await ben.client.rpc("delete_recurring_transaction", {
      recurring_transaction_id: id,
    });

    expect(error).toBeNull();
    expect(await ruleAs(ana, id)).toBeNull();
    expect(await transactionsIn(ana, checking)).toMatchObject([{ title: "Rent" }]);
    const [latest] = await historyOf(ana, id);
    expect(latest).toMatchObject({
      action: "delete",
      changed_by: ben.userId,
      old: { title: "Rent", done: 1 },
      new: null,
    });
  });
});

describe("deleting its category", () => {
  it("moves it where the category's transactions go", async () => {
    const id = await createRule(ana, rent());
    const groceries = await categoryIn(ana, familyId, "Groceries");

    const { error } = await ana.client.rpc("delete_category", {
      category_id: bills,
      move_to: groceries,
    });

    expect(error).toBeNull();
    expect(await ruleAs(ana, id)).toMatchObject({ category_id: groceries });
  });

  it("needs somewhere to move it, even with no transactions to move", async () => {
    const id = await createRule(ana, rent());

    const { error } = await ana.client.rpc("delete_category", {
      category_id: bills,
      move_to: null,
    });

    expect(error?.message).toBe(
      "a category's transactions move to another of its kind in its space",
    );
    expect(await ruleAs(ana, id)).toMatchObject({ category_id: bills });
  });
});

describe("a recurring transaction's history", () => {
  it("says who created it, and who recorded or skipped each one, newest first", async () => {
    const id = await createRule(ana, rent({ title: "Rent" }));
    await record(ben, id, 0);
    const [recorded] = await transactionsIn(ana, checking);
    await skip(ana, id, 1);

    const { data, error } = await ben.client.rpc("recurring_transaction_history", {
      recurring_transaction_id: id,
    });

    expect(error).toBeNull();
    expect(data).toMatchObject([
      {
        action: "update",
        changed_by: ana.userId,
        old: { done: 1 },
        new: { done: 2, skipped: true },
      },
      {
        action: "update",
        changed_by: ben.userId,
        old: { done: 0 },
        new: { done: 1, recorded: defined(recorded).id },
      },
      { action: "insert", changed_by: ana.userId, old: null, new: { title: "Rent", done: 0 } },
    ]);
  });
});

describe("grants", () => {
  it("keep the functions meant only for other functions out of members' reach", async () => {
    const id = await createRule(ana, rent());
    const rule = defined(await ruleAs(ana, id));

    const calls = await Promise.all([
      ana.client.rpc("transaction_sides", {
        transaction_type: "expense",
        account: checking,
        amount: 100,
        category: bills,
        to_account: checking,
        to_amount: 100,
        used_before: [],
      }),
      ana.client.rpc("lock_rule", { recurring_transaction: id }),
      ana.client.rpc("lock_upcoming", { recurring_transaction: id, occurrence: 0 }),
      ana.client.rpc("lock_due", { recurring_transaction: id, occurrence: 0 }),
      ana.client.rpc("move_on", { rule, how: {} }),
    ]);

    expect(calls.map(({ error }) => error?.code)).toEqual(calls.map(() => permissionDenied));
  });

  it("leave writing rules to the functions", async () => {
    const id = await createRule(ana, rent());

    const calls = await Promise.all([
      ana.client.from("recurring_transactions").update({ done: 5 }).eq("id", id),
      ana.client.from("recurring_transactions").delete().eq("id", id),
    ]);

    expect(calls.map(({ error }) => error?.code)).toEqual(calls.map(() => permissionDenied));
    expect(await ruleAs(ana, id)).toMatchObject({ done: 0 });
  });
});

type RuleArgs = Database["public"]["Functions"]["create_recurring_transaction"]["Args"];

function rent(overrides: Partial<RuleArgs> = {}): RuleArgs {
  return { ...rentRule(), record_first: false, ...overrides };
}

function rentRule(): Omit<RuleArgs, "record_first"> {
  return {
    transaction_type: "expense",
    title: null,
    note: null,
    account: checking,
    amount: 50_000,
    category: bills,
    to_account: null,
    to_amount: null,
    starts_on: "2026-01-31",
    every: 1,
    unit: "month",
    ends_on: null,
    times: null,
  };
}

async function createRule(user: User, args: RuleArgs): Promise<string> {
  const { data, error } = await user.client.rpc("create_recurring_transaction", args);
  if (error) throw error;
  return data;
}

type RecordingArgs = Database["public"]["Functions"]["record_recurring_transaction"]["Args"];

function recording(id: string, occurrence: number, amount = 50_000): RecordingArgs {
  return {
    recurring_transaction_id: id,
    occurrence,
    transaction_date: today(),
    amount,
    to_amount: null,
  };
}

async function record(user: User, id: string, occurrence: number): Promise<void> {
  const { error } = await user.client.rpc(
    "record_recurring_transaction",
    recording(id, occurrence),
  );
  if (error) throw error;
}

async function skip(user: User, id: string, occurrence: number): Promise<void> {
  const { error } = await user.client.rpc("skip_recurring_transaction", {
    recurring_transaction_id: id,
    occurrence,
  });
  if (error) throw error;
}

type EditArgs = Database["public"]["Functions"]["update_recurring_transaction"]["Args"];

function edit(id: string, overrides: Partial<EditArgs> = {}): EditArgs {
  return {
    recurring_transaction_id: id,
    seen_done: 0,
    restart: false,
    ...rentRule(),
    ...overrides,
  };
}

async function updateRule(user: User, args: EditArgs): Promise<void> {
  const { error } = await user.client.rpc("update_recurring_transaction", args);
  if (error) throw error;
}

async function historyOf(user: User, id: string) {
  const { data, error } = await user.client.rpc("recurring_transaction_history", {
    recurring_transaction_id: id,
  });
  if (error) throw error;
  return data;
}

async function pause(user: User, id: string): Promise<void> {
  const { error } = await user.client.rpc("pause_recurring_transaction", {
    recurring_transaction_id: id,
  });
  if (error) throw error;
}

async function ruleAs(user: User, id: string) {
  const { data, error } = await user.client
    .from("recurring_transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function rulesIn(user: User) {
  const { data, error } = await user.client.from("recurring_transactions").select("*");
  if (error) throw error;
  return data;
}

// Leaving out the account's opening balance.
async function transactionsIn(user: User, accountId: string) {
  const { data, error } = await user.client
    .from("transaction_details")
    .select("*")
    .or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`)
    .order("date")
    .order("created_at");
  if (error) throw error;
  return data;
}

async function balanceOf(user: User, accountId: string): Promise<number> {
  const { data, error } = await user.client
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .single();
  if (error) throw error;
  return data.balance;
}

async function addAccount(
  user: User,
  spaceId: string,
  name: string,
  openingAmount = 0,
): Promise<string> {
  const { data, error } = await user.client.rpc("create_account", {
    space: spaceId,
    account_name: name,
    account_currency: "USD",
    account_color: "blue",
    opening_amount: openingAmount,
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
