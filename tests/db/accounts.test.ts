import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  admin,
  createSpace,
  privateSpaceOf,
  signedInUser,
  sql,
  type SignedInUser as User,
} from "../support/local-instance.ts";

afterAll(() => sql.end());

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

describe("adding an account", () => {
  it("records its opening balance against the space's opening-balance category", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 150_000 });

    expect(await accountOf(ben, accountId)).toMatchObject({
      name: "Checking",
      currency: "USD",
      color: "blue",
      archived: false,
      balance: 150_000,
      opening_balance: 150_000,
      opening_date: today(),
      has_transactions: false,
    });
    const { data: counterparts } = await ben.client
      .from("postings")
      .select("amount, ledger_accounts(kind)")
      .neq("ledger_account_id", accountId);
    expect(counterparts).toEqual([
      { amount: -150_000, ledger_accounts: { kind: "opening_balance" } },
    ]);
  });

  it("gives every space one opening-balance category, which isn't listed as an account", async () => {
    const privateSpace = await privateSpaceOf(ana);

    const { data: categories } = await ana.client
      .from("ledger_accounts")
      .select("space_id")
      .eq("kind", "opening_balance");
    const { data: accounts } = await ana.client.from("accounts").select("id");

    expect(categories?.map(({ space_id }) => space_id).sort()).toEqual(
      [familyId, privateSpace.id].sort(),
    );
    expect(accounts).toEqual([]);
  });

  it("records no transaction for a zero opening balance", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 0 });

    expect(await accountOf(ana, accountId)).toMatchObject({
      balance: 0,
      opening_balance: 0,
      opening_date: null,
    });
    const { data } = await ana.client.from("postings").select("id");
    expect(data).toEqual([]);
  });

  it("refuses an opening balance dated in the future", async () => {
    const { error } = await ana.client.rpc("create_account", {
      ...newAccount(familyId),
      opening_date: "2999-01-01",
    });

    expect(error?.message).toMatch(/future/);
  });

  it("refuses a blank name", async () => {
    const { error } = await ana.client.rpc("create_account", {
      ...newAccount(familyId),
      account_name: "  ",
    });

    expect(error).not.toBeNull();
  });

  it("is only for members of the space, who alone see its accounts", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });

    const added = await carla.client.rpc("create_account", newAccount(familyId));
    const seen = await Promise.all([
      carla.client.from("accounts").select("id").eq("id", accountId),
      carla.client.from("postings").select("id").eq("ledger_account_id", accountId),
      carla.client.from("transactions").select("id"),
    ]);

    expect(added.error).not.toBeNull();
    expect(seen.map(({ data }) => data)).toEqual([[], [], []]);
  });

  it("puts new accounts after the space's others", async () => {
    const first = await addAccount(ana, familyId, { account_name: "First" });
    const second = await addAccount(ben, familyId, { account_name: "Second" });

    expect(await orderOf(ana, familyId)).toEqual([first, second]);
  });
});

describe("editing an account", () => {
  it("changes its name, color and opening balance", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });

    const { error } = await ben.client.rpc("update_account", {
      ...accountChanges(accountId),
      account_name: "Main",
      account_color: "pink",
      opening_amount: -2_500,
      opening_date: "2026-01-31",
    });

    expect(error).toBeNull();
    expect(await accountOf(ana, accountId)).toMatchObject({
      name: "Main",
      color: "pink",
      balance: -2_500,
      opening_balance: -2_500,
      opening_date: "2026-01-31",
    });
  });

  it("changes the currency of an account whose only transaction is its opening balance", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });

    const { error } = await ana.client.rpc("update_account", {
      ...accountChanges(accountId),
      account_currency: "JPY",
      opening_amount: 15,
    });

    expect(error).toBeNull();
    expect(await accountOf(ana, accountId)).toMatchObject({ currency: "JPY", balance: 15 });
  });

  it("removes the opening balance's transaction when it becomes zero", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });

    await ana.client.rpc("update_account", { ...accountChanges(accountId), opening_amount: 0 });

    expect(await accountOf(ana, accountId)).toMatchObject({ balance: 0, opening_date: null });
    const { data } = await ana.client.from("transactions").select("id");
    expect(data).toEqual([]);
  });

  it("is only for members of its space", async () => {
    const accountId = await addAccount(ana, familyId);

    const { error } = await carla.client.rpc("update_account", {
      ...accountChanges(accountId),
      account_name: "Hijacked",
    });

    expect(error).not.toBeNull();
    expect(await accountOf(ana, accountId)).toMatchObject({ name: "Checking" });
  });

  it("archives and unarchives it, keeping its balance", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });

    await ben.client.from("accounts").update({ archived: true }).eq("id", accountId);
    const archived = await accountOf(ana, accountId);
    await ana.client.from("accounts").update({ archived: false }).eq("id", accountId);

    expect(archived).toMatchObject({ archived: true, balance: 100 });
    expect(await accountOf(ana, accountId)).toMatchObject({ archived: false });
  });

  it("can't move it to another space", async () => {
    const accountId = await addAccount(ana, familyId);
    const privateSpace = await privateSpaceOf(ana);

    const moves = await Promise.all([
      ana.client.from("accounts").update({ space_id: privateSpace.id }).eq("id", accountId),
      ana.client.from("ledger_accounts").update({ space_id: privateSpace.id }).eq("id", accountId),
    ]);

    expect(moves.map(({ error }) => error)).not.toContain(null);
    expect(await accountOf(ana, accountId)).toMatchObject({ space_id: familyId });
  });

  it("reorders a space's accounts for all its members", async () => {
    const first = await addAccount(ana, familyId, { account_name: "First" });
    const second = await addAccount(ana, familyId, { account_name: "Second" });

    const { error } = await ana.client.rpc("reorder_accounts", { account_ids: [second, first] });

    expect(error).toBeNull();
    expect(await orderOf(ben, familyId)).toEqual([second, first]);
  });

  it("can't write transactions or postings directly", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });

    const transaction = await ana.client
      .from("transactions")
      .insert({ date: today(), created_by: ana.userId });
    const posting = await ana.client
      .from("postings")
      .update({ amount: 1_000_000 })
      .eq("ledger_account_id", accountId);

    expect(transaction.error).not.toBeNull();
    expect(posting.error).not.toBeNull();
    expect(await accountOf(ana, accountId)).toMatchObject({ balance: 100 });
  });
});

describe("an account with other transactions", () => {
  let checking: string;
  let savings: string;

  beforeEach(async () => {
    checking = await addAccount(ana, familyId, { opening_amount: 100 });
    savings = await addAccount(ana, familyId);
    await transfer(checking, savings, 40);
  });

  it("can't be deleted", async () => {
    const { error } = await ana.client.from("accounts").delete().eq("id", checking);

    expect(error).not.toBeNull();
    expect(await accountOf(ana, checking)).toMatchObject({ balance: 60, has_transactions: true });
  });

  it("can't change its currency", async () => {
    const { error } = await ana.client.rpc("update_account", {
      ...accountChanges(checking),
      account_currency: "EUR",
    });

    expect(error?.message).toMatch(/currency can't change/);
  });

  it("keeps its shared space from being deleted", async () => {
    const { error } = await ana.client.from("spaces").delete().eq("id", familyId);

    expect(error).not.toBeNull();
    const { data } = await ana.client.from("spaces").select("id").eq("id", familyId);
    expect(data).toHaveLength(1);
  });
});

describe("deleting an account", () => {
  it("deletes its opening balance with it", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });

    const { error } = await ben.client.from("accounts").delete().eq("id", accountId);

    expect(error).toBeNull();
    const [left] = await sql`
      select
        (select count(*)::int from ledger_accounts where id = ${accountId}) as accounts,
        (select count(*)::int from postings where ledger_account_id = ${accountId}) as postings`;
    expect(left).toEqual({ accounts: 0, postings: 0 });
  });

  it("leaves a shared space holding only opening balances deletable", async () => {
    await addAccount(ana, familyId, { opening_amount: 100 });

    const { error } = await ana.client.from("spaces").delete().eq("id", familyId);

    expect(error).toBeNull();
    const { data } = await ana.client.from("spaces").select("id").eq("id", familyId);
    expect(data).toEqual([]);
  });

  it("doesn't let a non-member delete it", async () => {
    const accountId = await addAccount(ana, familyId);

    await carla.client.from("accounts").delete().eq("id", accountId);

    expect(await accountOf(ana, accountId)).toMatchObject({ id: accountId });
  });
});

describe("the activity record", () => {
  it("logs an account, and its opening balance as one entry with its postings", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });

    const entries = await activityOf(ben, familyId);

    expect(entries).toEqual([
      expect.objectContaining({
        table_name: "ledger_accounts",
        action: "insert",
        row_id: accountId,
      }),
      expect.objectContaining({
        table_name: "transactions",
        action: "insert",
        changed_by: ana.userId,
        new: expect.objectContaining({
          postings: expect.arrayContaining([
            expect.objectContaining({ ledger_account_id: accountId, amount: 100 }),
            expect.objectContaining({ account_kind: "opening_balance", amount: -100 }),
          ]) as unknown,
        }) as unknown,
      }),
    ]);
  });

  it("logs an edited opening balance as one entry, with what it was before", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });

    await ana.client.rpc("update_account", { ...accountChanges(accountId), opening_amount: 250 });

    const edits = (await activityOf(ana, familyId)).filter(({ action }) => action === "update");
    expect(edits).toEqual([
      expect.objectContaining({
        table_name: "transactions",
        old: expect.objectContaining({
          postings: expect.arrayContaining([expect.objectContaining({ amount: 100 })]) as unknown,
        }) as unknown,
        new: expect.objectContaining({
          postings: expect.arrayContaining([expect.objectContaining({ amount: 250 })]) as unknown,
        }) as unknown,
      }),
    ]);
  });

  it("doesn't log reordering", async () => {
    const first = await addAccount(ana, familyId);
    const second = await addAccount(ana, familyId);

    await ana.client.rpc("reorder_accounts", { account_ids: [second, first] });

    const edits = (await activityOf(ana, familyId)).filter(({ action }) => action === "update");
    expect(edits).toEqual([]);
  });

  it("logs accounts in a private space too", async () => {
    const privateSpace = await privateSpaceOf(ana);

    const accountId = await addAccount(ana, privateSpace.id);

    expect(await activityOf(ana, privateSpace.id)).toEqual([
      expect.objectContaining({ table_name: "ledger_accounts", row_id: accountId }),
    ]);
  });

  it("gives each account its history, opening balance included", async () => {
    const accountId = await addAccount(ana, familyId, { opening_amount: 100 });
    await addAccount(ana, familyId, { account_name: "Other", opening_amount: 5 });
    await ana.client.rpc("update_account", { ...accountChanges(accountId), account_name: "Main" });

    const { data } = await ben.client.rpc("account_history", { account_id: accountId });

    expect(data?.map(({ table_name, action }) => [table_name, action])).toEqual([
      ["ledger_accounts", "update"],
      ["transactions", "insert"],
      ["ledger_accounts", "insert"],
    ]);
  });

  it("makes a user who added an account undeletable", async () => {
    await addAccount(ana, (await privateSpaceOf(ana)).id, { opening_amount: 100 });

    const { error } = await admin.auth.admin.deleteUser(ana.userId);

    expect(error).not.toBeNull();
  });
});

async function addAccount(
  user: User,
  spaceId: string,
  overrides: Partial<NewAccount> = {},
): Promise<string> {
  const { data, error } = await user.client.rpc("create_account", {
    ...newAccount(spaceId),
    ...overrides,
  });
  if (error) throw error;
  return data;
}

function newAccount(spaceId: string) {
  return { space: spaceId, ...checking(0) };
}

type NewAccount = ReturnType<typeof newAccount>;

// What addAccount creates with an opening balance of 100, to change one thing at a time.
function accountChanges(accountId: string) {
  return { account_id: accountId, ...checking(100) };
}

function checking(openingAmount: number) {
  return {
    account_name: "Checking",
    account_currency: "USD",
    account_color: "blue" as const,
    opening_amount: openingAmount,
    opening_date: today(),
  };
}

async function accountOf(user: User, accountId: string) {
  const { data, error } = await user.client
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (error) throw error;
  return data;
}

async function orderOf(user: User, spaceId: string): Promise<string[]> {
  const { data, error } = await user.client
    .from("accounts")
    .select("id")
    .eq("space_id", spaceId)
    .order("position");
  if (error) throw error;
  return data.map(({ id }) => id);
}

async function activityOf(user: User, spaceId: string) {
  const { data, error } = await user.client
    .from("activity")
    .select("table_name, action, row_id, changed_by, old, new")
    .eq("space_id", spaceId)
    .neq("table_name", "spaces")
    .neq("table_name", "space_members")
    .order("id");
  if (error) throw error;
  return data;
}

async function transfer(from: string, to: string, amount: number) {
  const { error } = await ana.client.rpc("add_transaction", {
    transaction_id: crypto.randomUUID(),
    transaction_type: "transfer",
    transaction_date: today(),
    title: null,
    note: null,
    account: from,
    amount,
    category: null,
    to_account: to,
    to_amount: null,
  });
  if (error) throw error;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
