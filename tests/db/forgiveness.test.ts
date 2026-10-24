import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/supabase/database.ts";
import {
  createSpace,
  privateSpaceOf,
  signedInUser,
  sql,
  type SignedInUser as User,
  uniqueName,
} from "../support/local-instance.ts";
import { today } from "../support/dates.ts";

afterAll(() => sql.end());

let ana: User;
let familyId: string;
let checking: string;
let charlie: string;

beforeEach(async () => {
  ana = await signedInUser("Ana");
  familyId = await createSpace(ana, uniqueName("Family"), []);
  checking = await addAccount(ana, familyId, "Checking");
  charlie = await addCounterparty(ana, familyId, "Charlie");
});

describe("forgiving a debt", () => {
  it("settles what a counterparty owed as spending from an account, which keeps its balance", async () => {
    await addTransaction(ana, debt({ transaction_type: "given", amount: 3_000 }));

    const id = await addTransaction(ana, debt({ transaction_type: "forgave", amount: 2_000 }));

    expect(await balanceOf(ana, checking)).toBe(7_000);
    expect(await owedBy(ana, charlie)).toBe(1_000);
    expect(await detailsOf(ana, id)).toMatchObject({
      type: "forgave",
      from_account_id: checking,
      from_amount: 2_000,
      to_account_id: checking,
      to_amount: 2_000,
      category_id: await builtIn(ana, familyId, "debts_forgiven"),
      counterparty_id: charlie,
    });
  });

  it("settles what the space owed a counterparty as income to an account", async () => {
    await addTransaction(ana, debt({ transaction_type: "received", amount: 500 }));

    const id = await addTransaction(ana, debt({ transaction_type: "forgiven", amount: 500 }));

    expect(await balanceOf(ana, checking)).toBe(10_500);
    expect(await owedBy(ana, charlie)).toBe(0);
    expect(await detailsOf(ana, id)).toMatchObject({
      type: "forgiven",
      category_id: await builtIn(ana, familyId, "debts_forgiven_to_you"),
      counterparty_id: charlie,
    });
  });

  it("turns money given into a forgiven debt when it's changed", async () => {
    await addTransaction(ana, debt({ transaction_type: "given", amount: 1_000 }));
    const id = await addTransaction(ana, debt({ transaction_type: "given", amount: 800 }));

    const { error } = await ana.client.rpc(
      "update_transaction",
      debt({ transaction_id: id, transaction_type: "forgave" }),
    );

    expect(error).toBeNull();
    expect(await balanceOf(ana, checking)).toBe(9_000);
    expect(await detailsOf(ana, id)).toMatchObject({ type: "forgave", from_amount: 1_000 });
  });

  it("comes back whole when restored", async () => {
    await addTransaction(ana, debt({ transaction_type: "given", amount: 400 }));
    const id = await addTransaction(ana, debt({ transaction_type: "forgave", amount: 400 }));
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error).toBeNull();
    expect(await detailsOf(ana, id)).toMatchObject({ type: "forgave", counterparty_id: charlie });
    expect(await owedBy(ana, charlie)).toBe(0);
  });

  it("refuses to forgive more than is owed, or what's owed the other way", async () => {
    await addTransaction(ana, debt({ transaction_type: "given", amount: 500 }));

    const tooMuch = await ana.client.rpc(
      "add_transaction",
      debt({ transaction_type: "forgave", amount: 501 }),
    );
    const wrongWay = await ana.client.rpc(
      "add_transaction",
      debt({ transaction_type: "forgiven", amount: 100 }),
    );

    for (const { error } of [tooMuch, wrongWay]) {
      expect(error?.message).toBe("a debt is forgiven up to what's owed");
      expect(error?.details).toBe("more_than_owed");
    }
    expect(await owedBy(ana, charlie)).toBe(500);
  });

  it("lets a forgiven debt change up to what's owed besides it", async () => {
    await addTransaction(ana, debt({ transaction_type: "given", amount: 500 }));
    const id = await addTransaction(ana, debt({ transaction_type: "forgave", amount: 200 }));

    const toAll = await ana.client.rpc(
      "update_transaction",
      debt({ transaction_id: id, amount: 500 }),
    );
    const beyond = await ana.client.rpc(
      "update_transaction",
      debt({ transaction_id: id, amount: 600 }),
    );

    expect(toAll.error).toBeNull();
    expect(beyond.error?.details).toBe("more_than_owed");
    expect(await owedBy(ana, charlie)).toBe(0);
  });

  it("refuses a counterparty from another space", async () => {
    const ownSpace = await privateSpaceOf(ana);
    const stranger = await addCounterparty(ana, ownSpace.id, "Stranger");

    const { error } = await ana.client.rpc(
      "add_transaction",
      debt({ transaction_type: "forgave", counterparty: stranger }),
    );

    expect(error?.message).toBe("a debt uses an account and a counterparty from the same space");
  });
});

describe("built-in categories", () => {
  it("come with every space, one of each kind, named by the app", async () => {
    const { data, error } = await ana.client
      .from("categories")
      .select("kind, name, built_in")
      .eq("space_id", familyId)
      .not("built_in", "is", null)
      .order("kind");

    expect(error).toBeNull();
    expect(data).toEqual([
      { kind: "expense", name: null, built_in: "debts_forgiven" },
      { kind: "income", name: null, built_in: "debts_forgiven_to_you" },
    ]);
  });

  it("take only forgiven debts", async () => {
    const forgiven = await builtIn(ana, familyId, "debts_forgiven");

    const { error } = await ana.client.rpc(
      "add_transaction",
      debt({ transaction_type: "expense", category: forgiven, counterparty: null }),
    );

    expect(error?.message).toBe("a built-in category takes only forgiven debts");
  });

  it("change their icon and color, but keep their name", async () => {
    const forgiven = await builtIn(ana, familyId, "debts_forgiven");

    const { error } = await ana.client.rpc(
      "update_category",
      categoryArgs(forgiven, { category_name: "Mine now" }),
    );

    expect(error).toBeNull();
    const { data } = await ana.client
      .from("categories")
      .select("name, icon, color")
      .eq("id", forgiven)
      .single();
    expect(data).toEqual({ name: null, icon: "gift", color: "red" });
  });

  it("keep their kind and stay at the top", async () => {
    const forgiven = await builtIn(ana, familyId, "debts_forgiven");
    const groceries = await categoryIn(ana, familyId, "Groceries");

    const kind = await ana.client.rpc(
      "update_category",
      categoryArgs(forgiven, { category_kind: "income" }),
    );
    const nested = await ana.client.rpc(
      "update_category",
      categoryArgs(forgiven, { parent: groceries }),
    );

    expect(kind.error?.message).toBe("a built-in category keeps its kind and has no parent");
    expect(nested.error?.message).toBe("a built-in category keeps its kind and has no parent");
  });

  it("take no subcategories", async () => {
    const forgiven = await builtIn(ana, familyId, "debts_forgiven");

    const { error } = await ana.client.rpc("create_category", {
      space: familyId,
      category_name: "Under it",
      category_kind: "expense",
      category_icon: "gift",
      category_color: "red",
      parent: forgiven,
    });

    expect(error?.message).toBe("a built-in category has no subcategories");
  });

  it("can't be deleted, nor take another's transactions", async () => {
    const forgiven = await builtIn(ana, familyId, "debts_forgiven");
    const groceries = await categoryIn(ana, familyId, "Groceries");
    await addTransaction(
      ana,
      debt({ transaction_type: "expense", category: groceries, counterparty: null }),
    );

    const deleted = await ana.client.rpc("delete_category", {
      category_id: forgiven,
      move_to: groceries,
    });
    const movedInto = await ana.client.rpc("delete_category", {
      category_id: groceries,
      move_to: forgiven,
    });

    expect(deleted.error?.message).toBe("a built-in category can't be deleted");
    expect(movedInto.error?.message).toBe(
      "a category's transactions move to another of its kind in its space",
    );
  });
});

type TransactionArgs = Database["public"]["Functions"]["add_transaction"]["Args"];

function debt(overrides: Partial<TransactionArgs> = {}): TransactionArgs {
  return {
    transaction_id: crypto.randomUUID(),
    transaction_type: "forgave",
    transaction_date: today(),
    title: null,
    note: null,
    account: checking,
    amount: 1_000,
    category: null,
    to_account: null,
    to_amount: null,
    counterparty: charlie,
    ...overrides,
  };
}

type CategoryArgs = Database["public"]["Functions"]["update_category"]["Args"];

function categoryArgs(categoryId: string, overrides: Partial<CategoryArgs> = {}): CategoryArgs {
  return {
    category_id: categoryId,
    category_name: "Debts forgiven",
    category_kind: "expense",
    category_icon: "gift",
    category_color: "red",
    parent: null,
    ...overrides,
  };
}

async function addTransaction(user: User, args: TransactionArgs): Promise<string> {
  const { error } = await user.client.rpc("add_transaction", args);
  if (error) throw error;
  return args.transaction_id;
}

async function addAccount(user: User, spaceId: string, name: string): Promise<string> {
  const { data, error } = await user.client.rpc("create_account", {
    space: spaceId,
    account_name: name,
    account_currency: "USD",
    account_color: "blue",
    opening_amount: 10_000,
    opening_date: today(),
  });
  if (error) throw error;
  return data;
}

async function addCounterparty(user: User, spaceId: string, name: string): Promise<string> {
  const { data, error } = await user.client.rpc("create_counterparty", {
    space: spaceId,
    counterparty_name: name,
    counterparty_color: "blue",
  });
  if (error) throw error;
  return data;
}

async function builtIn(
  user: User,
  spaceId: string,
  category: Database["public"]["Enums"]["built_in_category"],
): Promise<string> {
  const { data, error } = await user.client
    .from("categories")
    .select("id")
    .eq("space_id", spaceId)
    .eq("built_in", category)
    .single();
  if (error) throw error;
  return data.id;
}

// Starter categories: each name appears once per kind.
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

async function balanceOf(user: User, accountId: string): Promise<number> {
  const { data, error } = await user.client
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .single();
  if (error) throw error;
  return data.balance;
}

// The app sums a counterparty's postings, as here. Above zero, the counterparty owes the space.
async function owedBy(user: User, counterpartyId: string): Promise<number> {
  const { data, error } = await user.client
    .from("postings")
    .select("amount")
    .eq("ledger_account_id", counterpartyId);
  if (error) throw error;
  return data.reduce((total, { amount }) => total + amount, 0);
}

async function detailsOf(user: User, transactionId: string) {
  const { data, error } = await user.client
    .from("transaction_details")
    .select("*")
    .eq("id", transactionId)
    .single();
  if (error) throw error;
  return data;
}
