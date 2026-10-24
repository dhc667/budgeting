// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/supabase/database";
import { openApp, signIn, uniqueName, user } from "../support/app";
import { daysAgo } from "../support/dates";
import {
  defined,
  existingUser,
  password,
  signedInAs,
  signInLink,
  sql,
} from "../support/local-instance";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(() => sql.end());

describe("searching transactions", () => {
  it("finds them by title or note, whatever the accents and case", async () => {
    const ana = await budgetOf(uniqueName("Ana"));
    const account = await ana.account(ana.privateSpace, "Checking");
    const category = await ana.category(ana.privateSpace, "Eating out");
    await ana.expense({ account, category, title: "Café Central" });
    await ana.expense({ account, category, title: "Market", note: "Beans from the CAFETERÍA" });
    await ana.expense({ account, category, title: "Bakery" });
    await ana.open();
    await openTransactions();

    await user.type(screen.getByRole("searchbox", { name: "Search" }), "cafe");

    const list = within(screen.getByRole("main"));
    await waitFor(() => expect(list.queryByRole("link", { name: /Bakery/ })).toBeNull());
    expect(list.getByRole("link", { name: /Café Central/ })).toBeTruthy();
    expect(list.getByRole("link", { name: /Market/ })).toBeTruthy();
  });

  it("shows more of the matches a page at a time, never the others", async () => {
    const ana = await budgetOf(uniqueName("Ana"));
    const account = await ana.account(ana.privateSpace, "Checking");
    const category = await ana.category(ana.privateSpace, "Home");
    await Promise.all(
      Array.from({ length: 52 }, (_, week) =>
        ana.expense({ account, category, title: `Rent ${week + 1}`, date: daysAgo(1 + week * 7) }),
      ),
    );
    await ana.expense({ account, category, title: "Plumber" });
    await ana.open();
    await openTransactions();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "rent");
    const list = within(screen.getByRole("main"));
    await waitFor(() => expect(list.queryByRole("link", { name: /Plumber/ })).toBeNull());
    expect(list.getAllByRole("link", { name: /^Rent/ })).toHaveLength(50);

    await user.click(list.getByRole("button", { name: "Show more" }));

    await waitFor(() => expect(list.queryAllByRole("link", { name: /^Rent/ })).toHaveLength(52));
    expect(list.queryByRole("link", { name: /Plumber/ })).toBeNull();
    expect(list.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("starts over at one page whenever the search changes, even back to an earlier one", async () => {
    const ana = await budgetOf(uniqueName("Ana"));
    const account = await ana.account(ana.privateSpace, "Checking");
    const category = await ana.category(ana.privateSpace, "Home");
    await Promise.all(
      Array.from({ length: 52 }, (_, week) =>
        ana.expense({ account, category, title: `Rent ${week + 1}`, date: daysAgo(1 + week * 7) }),
      ),
    );
    await ana.expense({ account, category, title: "Plumber" });
    await ana.open();
    await openTransactions();
    const search = screen.getByRole("searchbox", { name: "Search" });
    await user.type(search, "rent");
    const list = within(screen.getByRole("main"));
    await waitFor(() => expect(list.queryByRole("link", { name: /Plumber/ })).toBeNull());
    await user.click(list.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(list.queryAllByRole("link", { name: /^Rent/ })).toHaveLength(52));

    await user.clear(search);
    await waitFor(() => expect(list.queryByRole("link", { name: /Plumber/ })).not.toBeNull());
    await user.type(search, "rent");

    await waitFor(() => expect(list.queryByRole("link", { name: /Plumber/ })).toBeNull());
    expect(list.getAllByRole("link", { name: /^Rent/ })).toHaveLength(50);
    expect(list.getByRole("button", { name: "Show more" })).toBeTruthy();
  });
});

describe("filtering transactions", () => {
  it("combines a category, its subcategories included, and dates with the space picker", async () => {
    const ana = await budgetOf(uniqueName("Ana"));
    const family = await ana.sharedSpace("Family");
    const joint = await ana.account(family, "Joint");
    const wallet = await ana.account(ana.privateSpace, "Wallet");
    const groceries = await ana.category(family, "Groceries");
    const fruit = await ana.subcategory(family, groceries, "Fruit");
    const eatingOut = await ana.category(family, "Eating out");
    const myGroceries = await ana.category(ana.privateSpace, "Groceries");
    const bought = (title: string, category: string, days: number, account = joint) =>
      ana.expense({ account, category, title, date: daysAgo(days) });
    await bought("Supermarket", groceries, 20);
    await bought("Fruit stand", fruit, 15);
    await bought("Long ago", groceries, 60);
    await bought("Just now", groceries, 2);
    await bought("Pizza", eatingOut, 15);
    await bought("Mine", myGroceries, 15, wallet);
    await ana.open();
    await hideSpace("Private");
    await openTransactions();

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await pick("Category", ["Groceries"]);
    await user.type(screen.getByLabelText("From"), daysAgo(30));
    await user.type(screen.getByLabelText("To"), daysAgo(10));

    const list = within(screen.getByRole("main"));
    await waitFor(() => expect(list.queryByRole("link", { name: /Just now/ })).toBeNull());
    expect(list.getByRole("link", { name: /Fruit stand/ })).toBeTruthy();
    expect(list.getByRole("link", { name: /Supermarket/ })).toBeTruthy();
    for (const left of [/Long ago/, /Pizza/, /Mine/])
      expect(list.queryByRole("link", { name: left })).toBeNull();
  });

  it("shows what any of the accounts chosen did in any of the categories chosen", async () => {
    const ana = await budgetOf(uniqueName("Ana"));
    const [checking, cash, card] = await Promise.all(
      ["Checking", "Cash", "Card"].map((name) => ana.account(ana.privateSpace, name)),
    );
    const [groceries, eatingOut, transport] = await Promise.all(
      ["Groceries", "Eating out", "Transport"].map((name) => ana.category(ana.privateSpace, name)),
    );
    await ana.expense({
      account: defined(checking),
      category: defined(groceries),
      title: "Market",
    });
    await ana.expense({ account: defined(cash), category: defined(eatingOut), title: "Lunch" });
    await ana.expense({
      account: defined(card),
      category: defined(groceries),
      title: "Online shop",
    });
    await ana.expense({ account: defined(checking), category: defined(transport), title: "Bus" });
    await ana.open();
    await openTransactions();

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await pick("Account", ["Checking", "Cash"]);
    await pick("Category", ["Groceries", "Eating out"]);

    const list = within(screen.getByRole("main"));
    // Each choice narrows the list as it's made; only all four together show Lunch but not Bus.
    await waitFor(() => {
      expect(list.queryByRole("link", { name: /Bus/ })).toBeNull();
      expect(list.getByRole("link", { name: /Lunch/ })).toBeTruthy();
    });
    expect(list.getByRole("link", { name: /Market/ })).toBeTruthy();
    expect(list.queryByRole("link", { name: /Online shop/ })).toBeNull();
  });

  it("keeps the search and filters after opening a transaction and coming back", async () => {
    const ana = await budgetOf(uniqueName("Ana"));
    const account = await ana.account(ana.privateSpace, "Checking");
    const eatingOut = await ana.category(ana.privateSpace, "Eating out");
    const groceries = await ana.category(ana.privateSpace, "Groceries");
    await ana.expense({ account, category: eatingOut, title: "Market lunch" });
    await ana.expense({ account, category: groceries, title: "Market" });
    await ana.expense({ account, category: eatingOut, title: "Bakery" });
    await ana.open();
    await openTransactions();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "market");
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await pick("Category", ["Eating out"]);
    const list = within(screen.getByRole("main"));
    await waitFor(() =>
      expect(list.queryByRole("link", { name: /^Market\b(?! lunch)/ })).toBeNull(),
    );

    await user.click(list.getByRole("link", { name: /Market lunch/ }));
    await user.click(await screen.findByRole("link", { name: "Back to Transactions" }));

    expect(await screen.findByRole("searchbox", { name: "Search" })).toHaveProperty(
      "value",
      "market",
    );
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeTruthy();
    expect(await list.findByRole("link", { name: /Market lunch/ })).toBeTruthy();
    for (const left of [/^Market\b(?! lunch)/, /Bakery/])
      expect(list.queryByRole("link", { name: left })).toBeNull();
  });
});

describe("a day's total", () => {
  it("adds up what the filters let through on that day", async () => {
    const ana = await budgetOf(uniqueName("Ana"));
    const account = await ana.account(ana.privateSpace, "Checking");
    const groceries = await ana.category(ana.privateSpace, "Groceries");
    const eatingOut = await ana.category(ana.privateSpace, "Eating out");
    await ana.expense({ account, category: groceries, title: "Market" });
    await ana.expense({ account, category: groceries, title: "Bakery" });
    await ana.expense({ account, category: eatingOut, title: "Lunch", amount: 1_250 });
    await ana.open();
    await openTransactions();
    const list = within(screen.getByRole("main"));
    expect(await list.findByText("-$32.50")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await pick("Category", ["Groceries"]);

    expect(await list.findByText("-$20.00")).toBeTruthy();
    expect(list.queryByText("-$32.50")).toBeNull();
  });

  it("covers the whole day when only some of it is shown, and says so", async () => {
    const ana = await budgetOf(uniqueName("Ana"));
    const account = await ana.account(ana.privateSpace, "Checking");
    const category = await ana.category(ana.privateSpace, "Groceries");
    await Promise.all(
      Array.from({ length: 51 }, (_, each) =>
        ana.expense({ account, category, title: `Market ${each + 1}` }),
      ),
    );
    await ana.open();
    await openTransactions();
    const list = within(screen.getByRole("main"));

    expect(await list.findByText("50 of 51 shown")).toBeTruthy();
    expect(list.getByText("-$510.00")).toBeTruthy();
    await user.click(list.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(list.queryByText("50 of 51 shown")).toBeNull());
    expect(list.getByText("-$510.00")).toBeTruthy();
  });
});

// Recorded straight through the instance, so that notes and past dates take no trips through the
// form, before the app opens: it would hold on to the categories it read until they go stale.
async function budgetOf(name: string) {
  const { email, userId } = await existingUser(name);
  const client = await signedInAs(email);
  const { data: privateSpace, error } = await client
    .from("spaces")
    .select("id")
    .eq("private_owner", userId)
    .single();
  if (error) throw error;

  const budget = {
    async open() {
      openApp(signInLink());
      await signIn(email, password);
      await screen.findByRole("heading", { name: new RegExp(`, ${name}$`) });
    },
    privateSpace: privateSpace.id,
    sharedSpace: (spaceName: string) =>
      rpc(client, "create_space", {
        space_name: spaceName,
        member_ids: [],
        starter_language: "en",
      }),
    account: (space: string, accountName: string) =>
      rpc(client, "create_account", {
        space,
        account_name: accountName,
        account_currency: "USD",
        account_color: "blue",
        opening_amount: 0,
        opening_date: daysAgo(400),
      }),
    async category(space: string, categoryName: string): Promise<string> {
      const { data, error } = await client
        .from("categories")
        .select("id")
        .eq("space_id", space)
        .eq("name", categoryName)
        .single();
      if (error) throw error;
      return data.id;
    },
    subcategory: (space: string, parent: string, categoryName: string) =>
      rpc(client, "create_category", {
        space,
        category_kind: "expense",
        category_name: categoryName,
        category_icon: "utensils",
        category_color: "blue",
        parent,
      }),
    async expense({
      account,
      category,
      title,
      note = null,
      date = daysAgo(0),
      amount = 1_000,
    }: Expense) {
      await rpc(client, "add_transaction", {
        transaction_id: crypto.randomUUID(),
        transaction_type: "expense",
        transaction_date: date,
        title,
        note,
        account,
        amount,
        category,
        to_account: null,
        to_amount: null,
      });
    },
  };
  return budget;
}

type Expense = {
  account: string;
  category: string;
  title: string;
  note?: string | null;
  date?: string;
  amount?: number;
};

async function rpc<Name extends keyof Functions>(
  client: Awaited<ReturnType<typeof signedInAs>>,
  name: Name,
  args: Functions[Name]["Args"],
): Promise<Functions[Name]["Returns"]> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

type Functions = Database["public"]["Functions"];

async function pick(filter: string, options: string[]) {
  await user.click(screen.getByRole("button", { name: new RegExp(`^${filter}`) }));
  for (const option of options) await user.click(screen.getByRole("checkbox", { name: option }));
  await user.keyboard("{Escape}");
}

async function hideSpace(spaceName: string) {
  await user.click(defined((await screen.findAllByRole("button", { name: "All spaces" }))[0]));
  await user.click(screen.getByRole("checkbox", { name: spaceName }));
  await user.keyboard("{Escape}");
}

async function openTransactions() {
  await user.click(defined((await screen.findAllByRole("link", { name: "Transactions" }))[0]));
  await screen.findByRole("heading", { name: "Transactions", level: 1 });
}
