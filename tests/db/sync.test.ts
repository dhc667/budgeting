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
import { today } from "../support/dates.ts";

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

    await sql`update postings set amount = amount where transaction_id = ${id}`;

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
    expect(JSON.stringify(history.map(({ old, new: next }) => [old, next]))).not.toContain(
      "version",
    );
  });

  it("logs no entry for a change that leaves an account as it was, and none with a version in it", async () => {
    await ana.client.from("ledger_accounts").update({ archived: true }).eq("id", checking);
    await sql`update ledger_accounts set archived = archived where id = ${checking}`;

    const { data } = await ben.client
      .from("activity")
      .select("action, old, new")
      .eq("space_id", familyId)
      .eq("table_name", "ledger_accounts")
      .order("id");

    expect(data?.map(({ action }) => action)).toEqual(["insert", "update"]);
    expect(JSON.stringify(data)).not.toContain("version");
  });
});

async function pull(user: User, since = 0): Promise<Changes> {
  const { data, error } = await user.client.rpc("changes_since", { since });
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

async function addAccount(user: User, spaceId: string, name: string, openingAmount: number) {
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
