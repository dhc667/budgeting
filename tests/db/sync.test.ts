import postgres from "postgres";
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

type Changes = Database["public"]["Functions"]["changes_since"]["Returns"];

const otherConnection = postgres(defined(process.env.DATABASE_URL), { max: 1, onnotice: () => {} });

afterAll(async () => {
  await otherConnection.end();
  await sql.end();
});

let ana: User;
let ben: User;
let carla: User;
let familyId: string;
let checking: string;
let groceries: string;

beforeEach(async () => {
  [ana, ben, carla] = await Promise.all([
    signedInUser("Ana"),
    signedInUser("Ben"),
    signedInUser("Carla"),
  ]);
  familyId = await createSpace(ana, "Family", [ben]);
  checking = await addAccount(ana, familyId, "Checking", 10_000);
  groceries = await categoryIn(ana, familyId, "Groceries");
});

describe("a first pull", () => {
  it("returns what the user can see in their spaces, and their space ids", async () => {
    const id = await addExpense(ana, 2_500);

    const pulled = await pull(ben);

    expect(pulled.reset).toBe(false);
    expect(pulled.space_ids).toContain(familyId);
    expect(pulled.space_ids).toContain((await privateSpaceOf(ben)).id);
    expect(pulled.space_ids).not.toContain((await privateSpaceOf(ana)).id);
    expect(pulled.rows.spaces.map(({ id }) => id)).toContain(familyId);
    expect(pulled.rows.ledger_accounts.map(({ name }) => name)).toContain("Checking");
    expect(pulled.rows.transactions.map((row) => row.id)).toContain(id);
    expect(pulled.rows.postings.filter(({ transaction_id }) => transaction_id === id)).toHaveLength(
      2,
    );
    expect(pulled.rows.currencies.length).toBeGreaterThan(0);
    expect(pulled.rows.profiles.map(({ id }) => id)).toEqual(
      expect.arrayContaining([ana.userId, ben.userId, carla.userId]),
    );
  });

  it("leaves out the spaces the user isn't in", async () => {
    const id = await addExpense(ana, 2_500);

    const pulled = await pull(carla);

    const spaceIds = pulled.rows.spaces.map(({ id }) => id);
    expect(spaceIds).toEqual(pulled.space_ids);
    expect(spaceIds).not.toContain(familyId);
    expect(pulled.rows.ledger_accounts.map(({ space_id }) => space_id)).not.toContain(familyId);
    expect(pulled.rows.transactions.map(({ id }) => id)).not.toContain(id);
    expect(pulled.rows.activity.map(({ space_id }) => space_id)).not.toContain(familyId);
  });
});

describe("exchange rates in a pull", () => {
  beforeEach(async () => {
    await addRates("XSA", "XSB", "XSC", "XSD");
  });

  it("sends the full history of the currency of an account the user can see", async () => {
    await addAccount(ana, familyId, "Euros", 0, "XSA");

    const pulled = await pull(ben);

    expect(pulled.rate_currencies).toContain("XSA");
    expect(ratesOf(pulled, "XSA")).toHaveLength(rateDays);
  });

  it("sends the full history of the user's display currency", async () => {
    const { error } = await ben.client
      .from("profiles")
      .update({ display_currency: "XSB" })
      .eq("id", ben.userId);
    if (error) throw error;

    const pulled = await pull(ben);

    expect(pulled.rate_currencies).toContain("XSB");
    expect(ratesOf(pulled, "XSB")).toHaveLength(rateDays);
  });

  it("sends only the latest rate of a currency the user doesn't use", async () => {
    const pulled = await pull(ben);

    expect(pulled.rate_currencies).not.toContain("XSC");
    expect(ratesOf(pulled, "XSC").map(({ date }) => date)).toEqual([daysAgo(1)]);
  });

  it("leaves out the history of a currency used only in a space the user isn't in", async () => {
    await addAccount(ana, (await privateSpaceOf(ana)).id, "Reais", 0, "XSD");

    const pulled = await pull(ben);

    expect(pulled.rate_currencies).not.toContain("XSD");
    expect(ratesOf(pulled, "XSD")).toHaveLength(1);
  });

  it("lists a currency once an account in it is added", async () => {
    const before = await pull(ben);
    expect(before.rate_currencies).not.toContain("XSA");

    await addAccount(ana, familyId, "Euros", 0, "XSA");

    const after = await pull(ben, before.version, before.rate_currencies);
    expect(after.rate_currencies).toContain("XSA");
    expect(ratesOf(after, "XSA")).toHaveLength(rateDays);
  });

  it("sends the whole history of a used currency the device doesn't hold, from a recent version", async () => {
    await addAccount(ana, familyId, "Euros", 0, "XSA");
    const { version, rate_currencies } = await pull(ben);

    const unheld = await pull(
      ben,
      version,
      rate_currencies.filter((code) => code !== "XSA"),
    );
    const held = await pull(ben, version, rate_currencies);

    expect(ratesOf(unheld, "XSA")).toHaveLength(rateDays);
    expect(ratesOf(held, "XSA")).toEqual([]);
  });

  it("ignores the held currencies when the device starts over", async () => {
    await addAccount(ana, familyId, "Euros", 0, "XSA");

    const pulled = await pull(ben, 1e15, ["XSA"]);

    expect(pulled.reset).toBe(true);
    expect(ratesOf(pulled, "XSA")).toHaveLength(rateDays);
  });

  it("sends only the rates written since, plus the latest of an unused currency", async () => {
    await addRates("XSE", "XSF");
    await addAccount(ana, familyId, "Euros", 0, "XSE");
    const { version, rate_currencies } = await pull(ben);

    await sql`insert into public.exchange_rates (date, currency, rate)
      select ${today()}::date, code, 2 from unnest(array['XSE', 'XSF']) as code`;
    const pulled = await pull(ben, version, rate_currencies);

    expect(ratesOf(pulled, "XSE").map(({ date }) => date)).toContain(today());
    expect(ratesOf(pulled, "XSF").map(({ date }) => date)).toContain(today());
  });
});

describe("a later pull", () => {
  it("returns what another member recorded or edited since", async () => {
    const { version } = await pull(ben);

    const id = await addExpense(ana, 2_500);
    await update(ana, id, { amount: 3_000, title: "Market" });

    const pulled = await pull(ben, version);
    expect(pulled.rows.transactions).toMatchObject([{ id, title: "Market" }]);
    expect(pulled.rows.postings.map(({ amount }) => amount).sort()).toEqual([-3_000, 3_000]);
    expect(pulled.rows.spaces).toEqual([]);
  });

  it("returns nothing of the spaces' tables when nothing changed", async () => {
    await addExpense(ana, 2_500);
    const { version } = await pull(ben);

    const pulled = await pull(ben, version);

    expect(pulled.rows).toMatchObject({
      spaces: [],
      space_members: [],
      activity: [],
      ledger_accounts: [],
      transactions: [],
      postings: [],
      recurring_transactions: [],
      budgets: [],
      budget_exclusions: [],
    });
    expect(pulled.deleted).toEqual([]);
    expect(pulled.version).toBeGreaterThanOrEqual(version);
  });

  it("returns a transaction again when only its postings were written", async () => {
    const id = await addExpense(ana, 2_500);
    const { version } = await pull(ben);

    const eatingOut = await categoryIn(ana, familyId, "Eating out");
    const { error } = await ana.client.rpc("delete_category", {
      category_id: groceries,
      move_to: eatingOut,
    });
    expect(error).toBeNull();

    const pulled = await pull(ben, version);
    expect(pulled.rows.transactions.map((row) => row.id)).toEqual([id]);
  });

  it("returns a deleted transaction and its postings as deletions", async () => {
    const id = await addExpense(ana, 2_500);
    const before = await pull(ben);
    const postingIds = before.rows.postings
      .filter(({ transaction_id }) => transaction_id === id)
      .map((posting) => posting.id);

    const { error } = await ben.client.rpc("delete_transaction", { transaction_id: id });
    expect(error).toBeNull();

    const pulled = await pull(ana, before.version);
    expect(pulled.rows.transactions).toEqual([]);
    expect(pulled.rows.postings).toEqual([]);
    expect(pulled.deleted).toEqual(
      expect.arrayContaining([
        { table: "transactions", key: { id } },
        ...postingIds.map((postingId) => ({ table: "postings", key: { id: postingId } })),
      ]),
    );
    expect(postingIds).toHaveLength(2);
  });

  it("returns a restored transaction in rows, as well as among the deletions", async () => {
    const id = await addExpense(ana, 2_500);
    const { version } = await pull(ben);
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error).toBeNull();
    const pulled = await pull(ben, version);
    expect(pulled.rows.transactions.map((row) => row.id)).toEqual([id]);
    expect(pulled.deleted).toContainEqual({ table: "transactions", key: { id } });
  });

  it("returns a removed budget exclusion as a deletion keyed by both its columns", async () => {
    const budget = await createBudget(ana, [groceries]);
    const id = await addExpense(ana, 2_500);
    await setExclusions(ana, id, [budget]);
    const { version } = await pull(ben);

    await setExclusions(ana, id, []);

    const pulled = await pull(ben, version);
    expect(pulled.rows.budget_exclusions).toEqual([]);
    expect(pulled.deleted).toContainEqual({
      table: "budget_exclusions",
      key: { budget_id: budget, transaction_id: id },
    });
  });

  it("lets a member of another space read the key of a deletion", async () => {
    const id = await addExpense(ana, 2_500);
    const { version } = await pull(carla);
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const pulled = await pull(carla, version);

    expect(pulled.deleted).toContainEqual({ table: "transactions", key: { id } });
  });

  it("lists a space the user joined", async () => {
    const { version, space_ids } = await pull(ana);

    const tripId = await createSpace(ben, "Trip", [ana]);

    const pulled = await pull(ana, version);
    expect(space_ids).not.toContain(tripId);
    expect(pulled.space_ids).toContain(tripId);
    expect(pulled.rows.spaces.map(({ id }) => id)).toContain(tripId);
  });

  it("includes a row written by a Postgres transaction that committed after a later one", async () => {
    const { version } = await pull(ana);
    const late = await otherConnection.reserve();
    await late`begin`;
    await late`update profiles set display_name = 'Late Ben' where id = ${ben.userId}`;

    await ana.client.from("profiles").update({ display_name: "Early Ana" }).eq("id", ana.userId);
    const first = await pull(ana, version);
    await late`commit`;
    late.release();
    const second = await pull(ana, first.version);

    expect(first.rows.profiles.map(({ display_name }) => display_name)).toEqual(["Early Ana"]);
    expect(second.rows.profiles.map(({ display_name }) => display_name)).toContain("Late Ben");
  });

  it("is told to start over when its version is ahead of anything handed out", async () => {
    const pulled = await pull(ana, 1e15);

    expect(pulled.reset).toBe(true);
    expect(pulled.rows.spaces.map(({ id }) => id)).toContain(familyId);
    expect(pulled.rows.ledger_accounts.map(({ name }) => name)).toContain("Checking");
    expect(pulled.version).toBeLessThan(1e15);
  });
});

describe("the activity record", () => {
  it("keeps versions out of a transaction's history", async () => {
    const id = await addExpense(ana, 2_500);
    await update(ana, id, { amount: 3_000 });

    const history = await historyOf(ben, id);

    expect(history.map(({ action }) => action)).toEqual(["update", "insert"]);
    expectNoVersion(history);
  });

  it("logs no entry for a change that leaves an account as it was", async () => {
    await ana.client.from("ledger_accounts").update({ archived: true }).eq("id", checking);
    await ana.client.from("ledger_accounts").update({ archived: true }).eq("id", checking);

    const entries = await activityOf(ben, "ledger_accounts");

    expect(entries.map(({ action }) => action)).toEqual(["insert", "update"]);
  });

  it("keeps versions out of an account's activity", async () => {
    await ana.client.from("ledger_accounts").update({ archived: true }).eq("id", checking);

    expectNoVersion(await activityOf(ben, "ledger_accounts"));
  });

  it("keeps versions out of a deleted category's activity", async () => {
    const eatingOut = await categoryIn(ana, familyId, "Eating out");
    await addExpense(ana, 2_500);
    await ana.client.rpc("delete_category", { category_id: groceries, move_to: eatingOut });

    const entries = await activityOf(ben, "ledger_accounts");

    expect(entries.map(({ action }) => action)).toContain("delete");
    expectNoVersion(entries);
  });

  it("keeps versions out of a budget's activity when its exclusions change", async () => {
    const budget = await createBudget(ana, [groceries]);
    const id = await addExpense(ana, 2_500);
    await setExclusions(ana, id, [budget]);

    const entries = await activityOf(ben, "budgets");

    expect(entries.map(({ action }) => action)).toEqual(["insert", "update"]);
    expectNoVersion(entries);
  });

  it("keeps versions out of a recurring transaction's activity when one is recorded or skipped", async () => {
    const rule = await createRule(ana);
    for (const occurrence of [0, 1]) {
      const call =
        occurrence === 0
          ? ana.client.rpc("record_recurring_transaction", {
              recurring_transaction_id: rule,
              occurrence,
              transaction_date: today(),
              amount: 5_000,
              to_amount: null,
            })
          : ana.client.rpc("skip_recurring_transaction", {
              recurring_transaction_id: rule,
              occurrence,
            });
      const { error } = await call;
      expect(error).toBeNull();
    }

    const entries = await activityOf(ben, "recurring_transactions");

    expect(
      entries.filter(({ new: next }) => hasKey(next, "recorded") || hasKey(next, "skipped")),
    ).toHaveLength(2);
    expectNoVersion(entries);
  });
});

async function pull(user: User, since = 0, held: string[] = []): Promise<Changes> {
  const { data, error } = await user.client.rpc("changes_since", {
    since,
    held_currencies: held,
  });
  if (error) throw error;
  return data;
}

type Edit = { amount?: number; title?: string };

function expenseArgs(id: string, amount: number) {
  return {
    transaction_id: id,
    transaction_type: "expense" as const,
    transaction_date: today(),
    title: null,
    note: null,
    account: checking,
    amount,
    category: groceries,
    to_account: null,
    to_amount: null,
  };
}

async function addExpense(user: User, amount: number): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await user.client.rpc("add_transaction", expenseArgs(id, amount));
  if (error) throw error;
  return id;
}

async function update(user: User, id: string, edit: Edit) {
  const { error } = await user.client.rpc("update_transaction", {
    ...expenseArgs(id, edit.amount ?? 2_500),
    title: edit.title ?? null,
  });
  if (error) throw error;
}

async function historyOf(user: User, id: string) {
  const { data, error } = await user.client.rpc("transaction_history", { transaction_id: id });
  if (error) throw error;
  return data.map(({ action, old, new: next }) => ({ action, old, new: next }));
}

const rateDays = 5;

async function addRates(...currencies: string[]) {
  await sql`insert into public.currencies (code, decimals)
    select code, 2 from unnest(${currencies}::text[]) as code on conflict do nothing`;
  await sql`insert into public.exchange_rates (date, currency, rate)
    select (${daysAgo(1)}::date - day), code, 1.5
    from unnest(${currencies}::text[]) as code, generate_series(0, ${rateDays - 1}) as day
    on conflict do nothing`;
}

function ratesOf(pulled: Changes, currency: string) {
  return pulled.rows.exchange_rates.filter((rate) => rate.currency === currency);
}

async function addAccount(
  user: User,
  spaceId: string,
  name: string,
  openingAmount: number,
  currency = "USD",
) {
  const { data, error } = await user.client.rpc("create_account", {
    space: spaceId,
    account_name: name,
    account_currency: currency,
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

async function activityOf(user: User, table: string) {
  const { data, error } = await user.client
    .from("activity")
    .select("action, old, new")
    .eq("space_id", familyId)
    .eq("table_name", table)
    .order("id");
  if (error) throw error;
  return data;
}

function expectNoVersion(entries: { old: unknown; new: unknown }[]) {
  expect(entries.length).toBeGreaterThan(0);
  for (const { old, new: next } of entries) {
    expect(old ?? {}).not.toHaveProperty("version");
    expect(next ?? {}).not.toHaveProperty("version");
  }
}

function hasKey(snapshot: unknown, key: string): boolean {
  return typeof snapshot === "object" && snapshot !== null && key in snapshot;
}

async function createBudget(user: User, categoryIds: string[]): Promise<string> {
  const { data, error } = await user.client
    .from("budgets")
    .insert({
      space_id: familyId,
      name: "Food",
      currency: "USD",
      amount: 40_000,
      starts_on: "2026-01-01",
      every: 1,
      unit: "month",
      category_ids: categoryIds,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function setExclusions(user: User, transactionId: string, budgetIds: string[]) {
  const { error } = await user.client.rpc("set_budget_exclusions", {
    transaction_id: transactionId,
    budget_ids: budgetIds,
  });
  if (error) throw error;
}

async function createRule(user: User): Promise<string> {
  const { data, error } = await user.client.rpc("create_recurring_transaction", {
    transaction_type: "expense",
    title: null,
    note: null,
    account: checking,
    amount: 5_000,
    category: groceries,
    to_account: null,
    to_amount: null,
    starts_on: "2026-01-31",
    every: 1,
    unit: "month",
    ends_on: null,
    times: null,
    record_first: false,
  });
  if (error) throw error;
  return data;
}
