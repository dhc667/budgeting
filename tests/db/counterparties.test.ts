import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/supabase/database.ts";
import {
  createSpace,
  privateSpaceOf,
  signedInUser,
  sql,
  type SignedInUser as User,
} from "../support/local-instance.ts";
import { today } from "../support/dates.ts";

afterAll(() => sql.end());

let ana: User;
let ben: User;
let familyId: string;
let checking: string;
let charlie: string;

beforeEach(async () => {
  [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
  familyId = await createSpace(ana, "Family", []);
  checking = await addAccount(ana, familyId, "Checking");
  charlie = await addCounterparty(ana, familyId, "  Charlie  ");
});

describe("money given to or received from a counterparty", () => {
  it("gives money out of an account to a counterparty", async () => {
    const id = await addTransaction(ana, given({ amount: 2_500 }));

    expect(await balanceOf(ana, checking)).toBe(7_500);
    expect(await detailsOf(ana, id)).toMatchObject({
      type: "given",
      from_account_id: checking,
      from_amount: 2_500,
      to_account_id: null,
      category_id: null,
      counterparty_id: charlie,
    });
  });

  it("receives money from a counterparty into an account", async () => {
    const id = await addTransaction(ana, given({ transaction_type: "received", amount: 400 }));

    expect(await balanceOf(ana, checking)).toBe(10_400);
    expect(await detailsOf(ana, id)).toMatchObject({
      type: "received",
      to_account_id: checking,
      to_amount: 400,
      counterparty_id: charlie,
    });
  });

  it("turns an expense into money given when it's changed", async () => {
    const groceries = await categoryIn(ana, familyId, "Groceries");
    const lunch = await addTransaction(
      ana,
      given({ transaction_type: "expense", category: groceries, counterparty: null }),
    );

    const { error } = await ana.client.rpc(
      "update_transaction",
      given({ transaction_id: lunch, amount: 700 }),
    );

    expect(error).toBeNull();
    expect(await detailsOf(ana, lunch)).toMatchObject({
      type: "given",
      from_amount: 700,
      category_id: null,
      counterparty_id: charlie,
    });
  });

  it("refuses a counterparty from another space", async () => {
    const ownSpace = await privateSpaceOf(ana);
    const stranger = await addCounterparty(ana, ownSpace.id, "Stranger");

    const { error } = await ana.client.rpc("add_transaction", given({ counterparty: stranger }));

    expect(error?.message).toBe("a debt uses an account and a counterparty from the same space");
  });

  it("refuses a category in place of a counterparty, and a counterparty in place of a category", async () => {
    const groceries = await categoryIn(ana, familyId, "Groceries");

    const asCounterparty = await ana.client.rpc(
      "add_transaction",
      given({ counterparty: groceries }),
    );
    const asCategory = await ana.client.rpc(
      "add_transaction",
      given({ transaction_type: "expense", category: charlie, counterparty: null }),
    );

    expect(asCounterparty.error?.message).toBe("no such counterparty in your spaces");
    expect(asCategory.error?.message).toBe("no such category in your spaces");
  });
});

describe("restoring money given or received", () => {
  it("brings it back to its counterparty", async () => {
    const id = await addTransaction(ana, given({ amount: 600 }));
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error).toBeNull();
    expect(await detailsOf(ana, id)).toMatchObject({ type: "given", counterparty_id: charlie });
  });

  it("refuses once its counterparty has been deleted", async () => {
    const id = await addTransaction(ana, given());
    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await ana.client.rpc("delete_counterparty", { counterparty_id: charlie });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error).toMatchObject({
      message: "its counterparty was deleted",
      details: "counterparty_deleted",
    });
  });
});

describe("counterparties", () => {
  it("are added only by a member of the space", async () => {
    const { error } = await ben.client.rpc("create_counterparty", {
      space: familyId,
      counterparty_name: "Acme",
      counterparty_color: "red",
    });

    expect(error?.message).toBe("only a member of a space can add counterparties to it");
  });

  it("are saved once when sent again with the same id", async () => {
    const id = crypto.randomUUID();
    const args: Database["public"]["Functions"]["create_counterparty"]["Args"] = {
      space: familyId,
      counterparty_name: "Acme",
      counterparty_color: "red",
      counterparty_id: id,
    };

    const first = await ana.client.rpc("create_counterparty", args);
    const again = await ana.client.rpc("create_counterparty", args);

    expect([first.data, again.data]).toEqual([id, id]);
    const { data } = await ana.client.from("ledger_accounts").select("id").eq("name", "Acme");
    expect(data).toEqual([{ id }]);
  });

  it("are renamed and recolored", async () => {
    const { error } = await ana.client.rpc("update_counterparty", {
      counterparty_id: charlie,
      counterparty_name: "Charlie B.",
      counterparty_color: "green",
    });

    expect(error).toBeNull();
    expect(await ledgerAccount(ana, charlie)).toMatchObject({
      kind: "counterparty",
      name: "Charlie B.",
      color: "green",
    });
  });

  it("are deleted only while no transaction uses them", async () => {
    const acme = await addCounterparty(ana, familyId, "Acme");
    await addTransaction(ana, given());

    const used = await ana.client.rpc("delete_counterparty", { counterparty_id: charlie });
    const unused = await ana.client.rpc("delete_counterparty", { counterparty_id: acme });

    expect(used.error?.message).toBe("a counterparty with transactions can't be deleted");
    expect(unused.error).toBeNull();
    expect(await ledgerAccount(ana, acme)).toBeNull();
  });

  it("are out of reach of anyone outside their space", async () => {
    const { error } = await ben.client.rpc("update_counterparty", {
      counterparty_id: charlie,
      counterparty_name: "Mine",
      counterparty_color: "red",
    });

    expect(error?.message).toBe("no such counterparty in your spaces");
    expect(await ledgerAccount(ben, charlie)).toBeNull();
  });
});

type TransactionArgs = Database["public"]["Functions"]["add_transaction"]["Args"];

function given(overrides: Partial<TransactionArgs> = {}): TransactionArgs {
  return {
    transaction_id: crypto.randomUUID(),
    transaction_type: "given",
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

async function ledgerAccount(user: User, id: string) {
  const { data, error } = await user.client
    .from("ledger_accounts")
    .select("kind, name, color")
    .eq("id", id)
    .maybeSingle();
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

async function detailsOf(user: User, transactionId: string) {
  const { data, error } = await user.client
    .from("transaction_details")
    .select("*")
    .eq("id", transactionId)
    .single();
  if (error) throw error;
  return data;
}
