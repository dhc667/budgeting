import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/supabase/database.ts";
import {
  createSpace,
  defined,
  privateSpaceOf,
  signedInUser,
  sql,
  type SignedInUser as User,
  uniqueName,
} from "../support/local-instance.ts";
import { today } from "../support/dates.ts";

afterAll(() => sql.end());

let ana: User;
let ben: User;
let carla: User;
let familyId: string;
let checking: string;
let groceries: string;
let salary: string;

beforeEach(async () => {
  [ana, ben, carla] = await Promise.all([
    signedInUser("Ana"),
    signedInUser("Ben"),
    signedInUser("Carla"),
  ]);
  familyId = await createSpace(ana, uniqueName("Family"), [ben]);
  checking = await addAccount(ana, familyId, "Checking", { opening_amount: 10_000 });
  groceries = await categoryIn(ana, familyId, "Groceries");
  salary = await categoryIn(ana, familyId, "Salary");
});

describe("recording a transaction", () => {
  it("records an expense, which lowers the account's balance", async () => {
    const id = await addTransaction(ben, expense({ amount: 2_500, title: "  Market  " }));

    expect(await balanceOf(ana, checking)).toBe(7_500);
    expect(await detailsOf(ana, id)).toMatchObject({
      type: "expense",
      title: "Market",
      note: null,
      created_by: ben.userId,
      from_account_id: checking,
      from_amount: 2_500,
      from_currency: "USD",
      to_account_id: null,
      category_id: groceries,
      space_ids: [familyId],
      one_sided: false,
    });
  });

  it("records a refund, money coming back from an expense category", async () => {
    const id = await addTransaction(ana, expense({ transaction_type: "refund", amount: 400 }));

    expect(await balanceOf(ana, checking)).toBe(10_400);
    expect(await detailsOf(ana, id)).toMatchObject({
      type: "refund",
      to_account_id: checking,
      to_amount: 400,
      category_id: groceries,
    });
  });

  it("records an income from an income category", async () => {
    const id = await addTransaction(
      ana,
      expense({ transaction_type: "income", category: salary, amount: 300_000 }),
    );

    expect(await balanceOf(ana, checking)).toBe(310_000);
    expect(await detailsOf(ana, id)).toMatchObject({ type: "income", to_account_id: checking });
  });

  it("records a transfer between currencies with both real amounts", async () => {
    const reais = await addAccount(ana, familyId, "Reais", { account_currency: "BRL" });

    const id = await addTransaction(ana, transfer(checking, reais, 1_000, 5_400));

    expect(await balanceOf(ana, checking)).toBe(9_000);
    expect(await balanceOf(ana, reais)).toBe(5_400);
    expect(await detailsOf(ana, id)).toMatchObject({
      type: "transfer",
      from_account_id: checking,
      from_amount: 1_000,
      to_account_id: reais,
      to_amount: 5_400,
      to_currency: "BRL",
      category_id: null,
    });
  });

  it("moves the same amount in and out of a transfer in one currency", async () => {
    const savings = await addAccount(ana, familyId, "Savings");

    await addTransaction(ana, transfer(checking, savings, 1_000, 9_999));

    expect(await balanceOf(ana, savings)).toBe(1_000);
  });

  it("stores a blank title or note as none", async () => {
    const id = await addTransaction(ana, expense({ title: "   ", note: "" }));

    expect(await detailsOf(ana, id)).toMatchObject({ title: null, note: null });
  });

  it("saves a transaction sent twice once, as it was first sent", async () => {
    const id = crypto.randomUUID();

    await addTransaction(ana, expense({ transaction_id: id, amount: 100 }));
    const again = await ana.client.rpc("add_transaction", {
      ...expense({ transaction_id: id, amount: 999 }),
    });

    expect(again.error).toBeNull();
    expect(await balanceOf(ana, checking)).toBe(9_900);
    const entries = (await transactionActivityOf(ana, familyId)).filter(
      ({ row_id }) => row_id === id,
    );
    expect(entries).toHaveLength(1);
  });

  it("refuses a date in the future", async () => {
    const { error } = await ana.client.rpc(
      "add_transaction",
      expense({ transaction_date: "2999-01-01" }),
    );

    expect(error?.message).toMatch(/can't be dated in the future/);
  });

  it("refuses an amount of zero or less", async () => {
    const attempts = await Promise.all(
      [0, -100].map((amount) => ana.client.rpc("add_transaction", expense({ amount }))),
    );

    expect(attempts.map(({ error }) => error?.message)).toEqual(
      Array(2).fill(expect.stringMatching(/amount above zero/)),
    );
  });

  it("refuses an expense whose account and category are in different spaces", async () => {
    const wallet = await addAccount(ana, (await privateSpaceOf(ana)).id, "Wallet");

    const { error } = await ana.client.rpc("add_transaction", expense({ account: wallet }));

    expect(error?.message).toMatch(/account and a category from the same space/);
    expect(await balanceOf(ana, wallet)).toBe(0);
  });

  it("refuses a category of the other kind", async () => {
    const attempts = await Promise.all([
      ana.client.rpc("add_transaction", expense({ category: salary })),
      ana.client.rpc("add_transaction", expense({ transaction_type: "income" })),
    ]);

    expect(attempts.map(({ error }) => error?.message)).toEqual(
      Array(2).fill(expect.stringMatching(/an expense or refund uses an expense category/)),
    );
  });

  it("refuses a transfer from an account to itself", async () => {
    const { error } = await ana.client.rpc("add_transaction", transfer(checking, checking, 100));

    expect(error?.message).toMatch(/two different accounts/);
  });

  it("refuses a transfer between currencies without the amount received", async () => {
    const reais = await addAccount(ana, familyId, "Reais", { account_currency: "BRL" });

    const { error } = await ana.client.rpc("add_transaction", transfer(checking, reais, 100));

    expect(error?.message).toMatch(/needs the amount received/);
  });

  it("refuses new transactions in an archived account", async () => {
    await ana.client.from("accounts").update({ archived: true }).eq("id", checking);

    const { error } = await ana.client.rpc("add_transaction", expense());

    expect(error?.message).toMatch(/archived account takes no new transactions/);
  });

  it("is only for members of the account's space", async () => {
    const { error } = await carla.client.rpc("add_transaction", expense());

    expect(error?.message).toMatch(/no such account in your spaces/);
    expect(await balanceOf(ana, checking)).toBe(10_000);
  });

  it("can't be done by writing postings that don't balance", async () => {
    const id = await addTransaction(ana, expense({ amount: 100 }));

    const unbalanced = sql`
      update postings set amount = amount * 2 where transaction_id = ${id} and amount > 0`;

    await expect(unbalanced).rejects.toThrow(/postings must balance/);
  });
});

describe("a transfer between spaces", () => {
  let wallet: string;
  let transferId: string;

  beforeEach(async () => {
    wallet = await addAccount(ana, (await privateSpaceOf(ana)).id, "Wallet", {
      opening_amount: 5_000,
    });
    transferId = await addTransaction(ana, transfer(wallet, checking, 2_000));
  });

  it("moves money from a private space into a shared one", async () => {
    expect(await balanceOf(ana, wallet)).toBe(3_000);
    expect(await balanceOf(ben, checking)).toBe(12_000);
  });

  it("shows a member of one side only that side", async () => {
    expect(await detailsOf(ben, transferId)).toMatchObject({
      type: "transfer",
      one_sided: true,
      from_account_id: null,
      from_amount: null,
      to_account_id: checking,
      to_amount: 2_000,
      space_ids: [familyId],
    });
    expect(await detailsOf(ana, transferId)).toMatchObject({
      one_sided: false,
      from_account_id: wallet,
      to_account_id: checking,
    });
  });

  it("can't be changed or deleted by a member of one side only", async () => {
    const changed = await ben.client.rpc("update_transaction", {
      ...transfer(wallet, checking, 1),
      transaction_id: transferId,
    });
    const deleted = await ben.client.rpc("delete_transaction", { transaction_id: transferId });

    expect(changed.error?.message).toMatch(/only a member of both spaces/);
    expect(deleted.error?.message).toMatch(/only a member of both spaces/);
    expect(await balanceOf(ana, wallet)).toBe(3_000);
  });

  it("is changed and deleted by a member of both spaces", async () => {
    await ana.client.rpc("update_transaction", {
      ...transfer(wallet, checking, 500),
      transaction_id: transferId,
    });
    const afterChange = await balanceOf(ana, wallet);
    const { error } = await ana.client.rpc("delete_transaction", { transaction_id: transferId });

    expect(afterChange).toBe(4_500);
    expect(error).toBeNull();
    expect(await balanceOf(ana, wallet)).toBe(5_000);
  });

  it("logs each space's own side, and the other only as another space", async () => {
    const [family] = (await transactionActivityOf(ben, familyId)).filter(
      ({ row_id }) => row_id === transferId,
    );
    const [personal] = (await transactionActivityOf(ana, (await privateSpaceOf(ana)).id)).filter(
      ({ row_id }) => row_id === transferId,
    );

    expect(family).toMatchObject({ action: "insert", changed_by: ana.userId });
    expect(family?.new).toMatchObject({
      type: "transfer",
      other_space: "from",
      postings: [{ ledger_account_id: checking, account_name: "Checking", amount: 2_000 }],
    });
    expect(JSON.stringify(family?.new)).not.toMatch(new RegExp(`${wallet}|Wallet|-2000`));
    expect(personal?.new).toMatchObject({
      other_space: "to",
      postings: [{ ledger_account_id: wallet, amount: -2_000 }],
    });
  });

  it("gives a member of both spaces its history with both sides as one", async () => {
    await ana.client.rpc("update_transaction", {
      ...transfer(wallet, checking, 500),
      transaction_id: transferId,
    });

    const both = await ana.client.rpc("transaction_history", { transaction_id: transferId });
    const oneSide = await ben.client.rpc("transaction_history", { transaction_id: transferId });

    expect(both.data?.map(({ action }) => action)).toEqual(["update", "insert"]);
    expect(both.data?.[0]?.new).not.toHaveProperty("other_space");
    expect(both.data?.[0]?.new).toMatchObject({
      postings: [
        { ledger_account_id: checking, amount: 500 },
        { ledger_account_id: wallet, amount: -500 },
      ],
    });
    expect(oneSide.data?.[0]?.new).toMatchObject({
      other_space: "from",
      postings: [{ ledger_account_id: checking, amount: 500 }],
    });
  });
});

describe("editing a transaction", () => {
  it("changes it, and logs what it was before", async () => {
    const id = await addTransaction(ana, expense({ amount: 100, title: "Bread" }));

    const { error } = await ben.client.rpc("update_transaction", {
      ...expense({ transaction_type: "refund", amount: 250, title: "Bread back", note: "Stale" }),
      transaction_id: id,
    });

    expect(error).toBeNull();
    expect(await balanceOf(ana, checking)).toBe(10_250);
    expect(await detailsOf(ana, id)).toMatchObject({
      type: "refund",
      title: "Bread back",
      note: "Stale",
      created_by: ana.userId,
    });
    const [entry] = (await transactionActivityOf(ana, familyId)).filter(
      ({ action }) => action === "update",
    );
    expect(entry).toMatchObject({
      changed_by: ben.userId,
      old: { type: "expense", title: "Bread" },
      new: { type: "refund", title: "Bread back" },
    });
  });

  it("keeps an archived account it already used, but moves to none", async () => {
    const id = await addTransaction(ana, expense({ amount: 100 }));
    const old = await addAccount(ana, familyId, "Old");
    await ana.client.from("accounts").update({ archived: true }).in("id", [checking, old]);

    const kept = await ana.client.rpc("update_transaction", {
      ...expense({ amount: 300 }),
      transaction_id: id,
    });
    const moved = await ana.client.rpc("update_transaction", {
      ...expense({ account: old }),
      transaction_id: id,
    });

    expect(kept.error).toBeNull();
    expect(moved.error?.message).toMatch(/archived account takes no new transactions/);
    expect(await balanceOf(ana, checking)).toBe(9_700);
  });

  it("refuses a date in the future", async () => {
    const id = await addTransaction(ana, expense());

    const { error } = await ana.client.rpc("update_transaction", {
      ...expense({ transaction_date: "2999-01-01" }),
      transaction_id: id,
    });

    expect(error?.message).toMatch(/can't be dated in the future/);
  });

  it("is only for members of its space", async () => {
    const id = await addTransaction(ana, expense({ amount: 100 }));

    const changed = await carla.client.rpc("update_transaction", {
      ...expense({ amount: 1 }),
      transaction_id: id,
    });
    const deleted = await carla.client.rpc("delete_transaction", { transaction_id: id });

    expect(changed.error?.message).toMatch(/no such transaction in your spaces/);
    expect(deleted.error?.message).toMatch(/no such transaction in your spaces/);
    expect(await balanceOf(ana, checking)).toBe(9_900);
  });

  it("leaves opening balances to their account", async () => {
    const [opening] = await sql<{ transaction_id: string }[]>`
      select transaction_id from postings where ledger_account_id = ${checking}`;
    const id = defined(opening).transaction_id;

    const changed = await ana.client.rpc("update_transaction", {
      ...expense(),
      transaction_id: id,
    });
    const deleted = await ana.client.rpc("delete_transaction", { transaction_id: id });
    const listed = await ana.client.from("transaction_details").select("id").eq("id", id);

    expect(changed.error?.message).toMatch(/no such transaction/);
    expect(deleted.error?.message).toMatch(/no such transaction/);
    expect(listed.data).toEqual([]);
  });
});

describe("deleting a transaction", () => {
  it("restores the balance and logs what was deleted", async () => {
    const id = await addTransaction(ana, expense({ amount: 100, title: "Bread" }));

    const { error } = await ben.client.rpc("delete_transaction", { transaction_id: id });

    expect(error).toBeNull();
    expect(await balanceOf(ana, checking)).toBe(10_000);
    expect((await transactionActivityOf(ana, familyId)).at(-1)).toMatchObject({
      action: "delete",
      row_id: id,
      changed_by: ben.userId,
      old: { title: "Bread", postings: expect.any(Array) as unknown },
      new: null,
    });
  });
});

describe("restoring a deleted transaction", () => {
  it("brings it back as it was, and logs it as restored", async () => {
    const id = await addTransaction(ana, expense({ amount: 100, title: "Bread", note: "Rye" }));
    const before = await detailsOf(ana, id);
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const { error } = await ben.client.rpc("restore_transaction", { transaction_id: id });

    expect(error).toBeNull();
    expect(await detailsOf(ana, id)).toEqual(before);
    expect(await balanceOf(ana, checking)).toBe(9_900);
    expect((await transactionActivityOf(ana, familyId)).at(-1)).toMatchObject({
      action: "restore",
      row_id: id,
      changed_by: ben.userId,
      old: null,
      new: { title: "Bread", postings: expect.any(Array) as unknown },
    });
  });

  it("brings back a transfer between spaces with both sides", async () => {
    const wallet = await addAccount(ana, (await privateSpaceOf(ana)).id, "Wallet");
    const id = await addTransaction(ana, transfer(wallet, checking, 2_000));
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error).toBeNull();
    expect(await detailsOf(ana, id)).toMatchObject({
      from_account_id: wallet,
      to_account_id: checking,
      one_sided: false,
    });
    expect(await balanceOf(ana, wallet)).toBe(-2_000);
  });

  it("puts it back in an archived account", async () => {
    const id = await addTransaction(ana, expense({ amount: 100 }));
    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await ana.client.from("accounts").update({ archived: true }).eq("id", checking);

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error).toBeNull();
    expect(await balanceOf(ana, checking)).toBe(9_900);
  });

  it("puts it where its deleted category's transactions went", async () => {
    const snacks = await addCategory(ana, "Snacks");
    const treats = await addCategory(ana, "Treats");
    const id = await addTransaction(ana, expense({ category: snacks }));
    await addTransaction(ana, expense({ category: snacks }));
    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await ana.client.rpc("delete_category", { category_id: snacks, move_to: treats });
    await addTransaction(ana, expense({ category: treats }));
    await ana.client.rpc("delete_category", { category_id: treats, move_to: groceries });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error).toBeNull();
    expect(await detailsOf(ana, id)).toMatchObject({ category_id: groceries });
  });

  it("refuses when its category was deleted with no transactions to move", async () => {
    const snacks = await addCategory(ana, "Snacks");
    const id = await addTransaction(ana, expense({ category: snacks }));
    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await ana.client.rpc("delete_category", { category_id: snacks, move_to: groceries });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error?.details).toBe("category_deleted");
  });

  it("refuses when an account it used was deleted", async () => {
    const savings = await addAccount(ana, familyId, "Savings");
    const id = await addTransaction(ana, transfer(checking, savings, 1_000));
    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await ana.client.from("accounts").delete().eq("id", savings);

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error?.details).toBe("account_deleted");
    expect(await balanceOf(ana, checking)).toBe(10_000);
  });

  it("refuses when the space on the other side of a transfer was deleted", async () => {
    const trip = await createSpace(ana, uniqueName("Trip"), []);
    const kitty = await addAccount(ana, trip, "Kitty");
    const id = await addTransaction(ana, transfer(checking, kitty, 1_000));
    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await ana.client.from("spaces").delete().eq("id", trip);

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error?.details).toBe("account_deleted");
  });

  it("refuses when an account it used changed currency", async () => {
    const savings = await addAccount(ana, familyId, "Savings");
    const id = await addTransaction(ana, transfer(checking, savings, 1_000));
    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await ana.client.rpc("update_account", {
      account_id: savings,
      account_name: "Savings",
      account_currency: "EUR",
      account_color: "blue",
      opening_amount: 0,
      opening_date: today(),
    });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error?.details).toBe("currency_changed");
  });

  it("refuses a transfer to a member of one side only", async () => {
    const wallet = await addAccount(ana, (await privateSpaceOf(ana)).id, "Wallet");
    const id = await addTransaction(ana, transfer(wallet, checking, 2_000));
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const { error } = await ben.client.rpc("restore_transaction", { transaction_id: id });

    expect(error?.details).toBe("other_space");
    expect(await balanceOf(ana, checking)).toBe(10_000);
  });

  it("refuses a transaction that exists again", async () => {
    const id = await addTransaction(ana, expense({ amount: 100 }));
    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await ana.client.rpc("restore_transaction", { transaction_id: id });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error?.details).toBe("exists");
    expect(await balanceOf(ana, checking)).toBe(9_900);
  });

  it("restores the latest deletion when it was deleted twice", async () => {
    const id = await addTransaction(ana, expense({ amount: 100 }));
    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await ana.client.rpc("restore_transaction", { transaction_id: id });
    await ana.client.rpc("update_transaction", {
      ...expense({ amount: 300 }),
      transaction_id: id,
    });
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error).toBeNull();
    expect(await balanceOf(ana, checking)).toBe(9_700);
  });

  it("is only for members of its space", async () => {
    const id = await addTransaction(ana, expense());
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const { error } = await carla.client.rpc("restore_transaction", { transaction_id: id });

    expect(error?.message).toMatch(/no such deleted transaction in your spaces/);
  });

  it("leaves opening balances to their account", async () => {
    const [opening] = await sql<{ transaction_id: string }[]>`
      select transaction_id from postings where ledger_account_id = ${checking}`;
    const id = defined(opening).transaction_id;
    await ana.client.rpc("update_account", {
      account_id: checking,
      account_name: "Checking",
      account_currency: "USD",
      account_color: "blue",
      opening_amount: 0,
      opening_date: today(),
    });

    const { error } = await ana.client.rpc("restore_transaction", { transaction_id: id });

    expect(error?.message).toMatch(/opening balance comes back by setting it on its account/);
    expect(await balanceOf(ana, checking)).toBe(0);
  });
});

describe("sending a deleted transaction again", () => {
  it("doesn't bring it back", async () => {
    const args = expense({ title: "Bread" });
    const id = await addTransaction(ana, args);
    await ana.client.rpc("delete_transaction", { transaction_id: id });

    const { error } = await ana.client.rpc("add_transaction", args);

    expect(error).toBeNull();
    const found = await ana.client.from("transaction_details").select("id").eq("id", id);
    expect(found.data).toEqual([]);
    expect(await balanceOf(ana, checking)).toBe(10_000);
  });
});

describe("title suggestions", () => {
  it("give each title's latest transaction for each category, newest first", async () => {
    const personalId = (await privateSpaceOf(ana)).id;
    const wallet = await addAccount(ana, personalId, "Wallet");
    const eatingOut = await categoryIn(ana, familyId, "Eating out");
    const personalGroceries = await categoryIn(ana, personalId, "Groceries");
    await addTransaction(ana, expense({ title: "Market", transaction_date: "2026-01-01" }));
    const latestGroceries = await addTransaction(
      ana,
      expense({ title: "MARKET", amount: 2_000, transaction_date: "2026-01-15" }),
    );
    const eatingOutMarket = await addTransaction(
      ana,
      expense({ title: "market ", category: eatingOut, transaction_date: "2026-02-01" }),
    );
    const personalMarket = await addTransaction(
      ana,
      expense({ title: "Market", account: wallet, category: personalGroceries }),
    );
    await addTransaction(ben, expense({ title: "Ben's market" }));

    const { data } = await ana.client.rpc("title_suggestions");

    expect(data?.map(({ id }) => id)).toEqual([personalMarket, eatingOutMarket, latestGroceries]);
    expect(data?.[2]).toMatchObject({
      title: "MARKET",
      type: "expense",
      from_account_id: checking,
      from_amount: 2_000,
      category_id: groceries,
    });
  });

  it("give a titled transfer once for each pair of accounts", async () => {
    const savings = await addAccount(ana, familyId, "Savings");
    const cash = await addAccount(ana, familyId, "Cash");
    await addTransaction(ana, { ...transfer(checking, savings, 500), title: "Saving" });
    const toSavings = await addTransaction(ana, {
      ...transfer(checking, savings, 700),
      title: "Saving",
    });
    const toCash = await addTransaction(ana, { ...transfer(checking, cash, 300), title: "Saving" });

    const { data } = await ana.client.rpc("title_suggestions");

    expect(data?.map(({ id }) => id).sort()).toEqual([toSavings, toCash].sort());
  });

  it("give an expense and a refund of the same title and category apart", async () => {
    const bought = await addTransaction(ana, expense({ title: "Shoes" }));
    const returned = await addTransaction(
      ana,
      expense({ title: "Shoes", transaction_type: "refund" }),
    );

    const { data } = await ana.client.rpc("title_suggestions");

    expect(data?.map(({ id }) => id).sort()).toEqual([bought, returned].sort());
  });

  it("leave out a transfer the user now sees one side of", async () => {
    const tripId = await createSpace(ana, uniqueName("Trip"), [carla]);
    const tripCash = await addAccount(ana, tripId, "Trip cash");
    const id = await addTransaction(ana, {
      ...transfer(checking, tripCash, 500),
      title: "Trip money",
    });
    await ana.client
      .from("space_members")
      .delete()
      .eq("space_id", tripId)
      .eq("user_id", ana.userId);

    const { data } = await ana.client.rpc("title_suggestions");

    expect(await detailsOf(ana, id)).toMatchObject({ one_sided: true });
    expect(data).toEqual([]);
  });
});

describe("grants", () => {
  it("keep the functions meant only for other functions out of members' reach", async () => {
    const id = await addTransaction(ana, expense());

    const calls = await Promise.all([
      ana.client.rpc("write_postings", {
        transaction: id,
        transaction_type: "transfer",
        account: checking,
        amount: 100,
        other_side: groceries,
        to_account: checking,
        to_amount: 100,
        used_before: [],
      }),
      ana.client.rpc("usable_account", { account: checking, used_before: [] }),
      ana.client.rpc("lock_changeable_transaction", { transaction: id }),
      ana.client.rpc("log_transaction_changes", {
        transaction: id,
        action: "insert",
        before: {},
        after: {},
      }),
      ana.client.rpc("snapshots_by_space", { transaction: id }),
      ana.client.rpc("transaction_snapshot", { transaction: id, space: familyId }),
      ana.client.rpc("restored_ledger_account", { posting: {} }),
    ]);

    expect(calls.map(({ error }) => error?.code)).toEqual(calls.map(() => permissionDenied));
  });
});

type TransactionArgs = Database["public"]["Functions"]["add_transaction"]["Args"];

function expense(overrides: Partial<TransactionArgs> = {}): TransactionArgs {
  return {
    transaction_id: crypto.randomUUID(),
    transaction_type: "expense",
    transaction_date: today(),
    title: null,
    note: null,
    account: checking,
    amount: 1_000,
    category: groceries,
    to_account: null,
    to_amount: null,
    ...overrides,
  };
}

function transfer(from: string, to: string, amount: number, toAmount?: number): TransactionArgs {
  return expense({
    transaction_type: "transfer",
    account: from,
    amount,
    category: null,
    to_account: to,
    to_amount: toAmount ?? null,
  });
}

async function addTransaction(user: User, args: TransactionArgs): Promise<string> {
  const { error } = await user.client.rpc("add_transaction", args);
  if (error) throw error;
  return args.transaction_id;
}

async function addAccount(
  user: User,
  spaceId: string,
  name: string,
  overrides: { opening_amount?: number; account_currency?: string } = {},
): Promise<string> {
  const { data, error } = await user.client.rpc("create_account", {
    space: spaceId,
    account_name: name,
    account_currency: "USD",
    account_color: "blue",
    opening_amount: 0,
    opening_date: today(),
    ...overrides,
  });
  if (error) throw error;
  return data;
}

// Starter categories: each name appears once per kind, and these once in all.
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

async function addCategory(user: User, name: string): Promise<string> {
  const { data, error } = await user.client.rpc("create_category", {
    space: familyId,
    category_kind: "expense",
    category_name: name,
    category_icon: "utensils",
    category_color: "blue",
    parent: null,
  });
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

async function transactionActivityOf(user: User, spaceId: string) {
  const { data, error } = await user.client
    .from("activity")
    .select("action, row_id, changed_by, old, new")
    .eq("space_id", spaceId)
    .eq("table_name", "transactions")
    .order("id");
  if (error) throw error;
  return data.filter(({ new: snapshot, old }) => !isOpeningBalance(snapshot ?? old));
}

function isOpeningBalance(snapshot: unknown): boolean {
  return JSON.stringify(snapshot).includes('"opening_balance"');
}

const permissionDenied = "42501";
