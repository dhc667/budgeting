// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAccount,
  choose,
  goHome,
  openSignedIn,
  recordTransaction,
  uniqueName,
  user,
} from "../support/app";
import { daysAgo, today } from "../support/dates";
import { defined, sql } from "../support/local-instance";

vi.mock("../../src/rates/rates-provider", async () => {
  const { offlineProvider } = await import("../support/rates-provider");
  return offlineProvider;
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(() => sql.end());

describe("budgets", () => {
  it("count an expense against the budget, and a refund gives the money back", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await addBudget({ name: "Food", limit: "400", categories: ["Groceries", "Eating out"] });

    await recordTransaction({ amount: "100", category: "Groceries", title: "Market" });
    await recordTransaction({ amount: "20", category: "Transport", title: "Bus" });
    await expectStanding("Food", /\$100\.00.*of \$400\.00/);

    await recordTransaction({
      type: "Refund",
      amount: "30",
      category: "Groceries",
      title: "Market",
    });
    await expectStanding("Food", /\$70\.00.*of \$400\.00/);
  });

  it("say what can still go each day to spend the limit by the last one", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await addBudget({ name: "Trip", limit: "100", from: today(), to: daysAgo(-9) });

    await recordTransaction({ amount: "40", category: "Travel", title: "Hotel" });

    await expectStanding("Trip", /You can spend \$6\.00 a day for 10 more days/);
  });

  it("show how much of each past period's limit went", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await addBudget({ name: "Food", limit: "200", from: daysAgo(40) });

    await recordTransaction({ amount: "150", category: "Groceries", date: daysAgo(35) });
    await expectPastPeriod("Food", "$150.00 of $200.00", "75%");

    await recordTransaction({ amount: "60", category: "Groceries", date: daysAgo(35) });
    await expectPastPeriod("Food", "$210.00 of $200.00", "105%");
  });

  it("count overspending carried into a past period towards how much of it went", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await addBudget({ name: "Food", limit: "200", from: daysAgo(70), carryOverspent: true });

    await recordTransaction({ amount: "250", category: "Groceries", date: daysAgo(65) });
    await recordTransaction({ amount: "100", category: "Groceries", date: daysAgo(25) });

    await expectPastPeriod("Food", "$250.00 of $200.00", "125%");
    await expectPastPeriod("Food", "$100.00 of $150.00", "75%");
  });

  it("leave out a transaction picked out of one", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await addBudget({ name: "Health", limit: "200", categories: ["Health"] });
    await recordTransaction({ amount: "150", category: "Health", title: "Vet" });

    await user.click(await screen.findByRole("link", { name: /Vet/ }));
    await screen.findByRole("heading", { name: "Vet", level: 1 });
    await user.click(await screen.findByRole("button", { name: /Leave out of budgets/ }));
    await user.click(screen.getByRole("checkbox", { name: "Health" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved.");

    await expectStanding("Health", /\$0\.00.*of \$200\.00/);
    const history = within(screen.getByRole("region", { name: "History" }));
    expect(
      await history.findByText(new RegExp(`^${ana} left “Vet” of .* out of the budget “Health”$`)),
    ).toBeTruthy();
  });

  it("keep a transaction left out of a budget it stops counting toward, and back", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await addBudget({ name: "Health", limit: "200", categories: ["Health"] });
    await recordTransaction({ amount: "150", category: "Health", title: "Vet" });
    await editVet(async () => {
      await user.click(await screen.findByRole("button", { name: /Leave out of budgets/ }));
      await user.click(screen.getByRole("checkbox", { name: "Health" }));
    });

    await editVet(() => choose("Category", "Groceries"));
    await editVet(() => choose("Category", "Health"));

    await expectStanding("Health", /\$0\.00.*of \$200\.00/);
    const history = within(screen.getByRole("region", { name: "History" }));
    expect(await history.findByText(/left “Vet” of .* out of the budget “Health”$/)).toBeTruthy();
    expect(history.queryByText(/again$/)).toBeNull();
  });

  it("cover no account once its only one is deleted, and keep it so when edited", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await addAccount({ name: "Pocket", openingBalance: "" });
    await addBudget({ name: "Pocket money", limit: "100", accounts: ["Pocket"] });
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    await user.click(await accounts.findByRole("link", { name: /^Pocket/ }));
    await user.click(await screen.findByRole("button", { name: "Delete account" }));
    const dialog = within(screen.getByRole("dialog", { name: "Delete Pocket?" }));
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    await screen.findByRole("region", { name: "Accounts" });
    await recordTransaction({ amount: "30", account: "Checking", category: "Groceries" });

    await openBudget("Pocket money");
    expect(screen.getByRole("button", { name: "Accounts No accounts" })).toBeTruthy();
    await user.type(screen.getByLabelText("Name"), ", old");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved.");

    await expectStanding("Pocket money, old", /\$0\.00.*of \$100\.00/);
  });

  it("show on the dashboard only once there are any, one at a time", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    expect(screen.queryByRole("region", { name: "Budgets" })).toBeNull();

    await addBudget({ name: "Food", limit: "400", categories: ["Groceries"] });
    await addBudget({ name: "Fun", limit: "50", categories: ["Entertainment"] });
    await goHome();

    const budgets = within(await screen.findByRole("region", { name: "Budgets" }));
    expect(await budgets.findByRole("link", { name: /Food/ })).toBeTruthy();
    expect(budgets.getByRole("button", { name: "Show Food" })).toHaveProperty(
      "ariaCurrent",
      "true",
    );
    await user.click(budgets.getByRole("button", { name: "Show Fun" }));
    expect(budgets.getByRole("button", { name: "Show Fun" })).toHaveProperty("ariaCurrent", "true");
  });
});

type NewBudget = {
  name: string;
  limit: string;
  categories?: string[];
  accounts?: string[];
  // A fixed budget's dates; otherwise it repeats monthly from `from`, or today.
  from?: string;
  to?: string;
  carryOverspent?: boolean;
};

async function addBudget({
  name,
  limit,
  categories = [],
  accounts = [],
  from,
  to,
  carryOverspent = false,
}: NewBudget) {
  await user.click(defined(screen.getAllByRole("link", { name: "Budgets" })[0]));
  await user.click(await screen.findByRole("link", { name: "New budget" }));
  await screen.findByRole("heading", { name: "New budget", level: 1 });
  await user.type(screen.getByLabelText("Name"), name);
  await user.type(screen.getByLabelText("Limit"), limit);
  if (to) await user.click(screen.getByLabelText("Between two dates"));
  if (from) {
    await user.clear(screen.getByLabelText("Starts on"));
    await user.type(screen.getByLabelText("Starts on"), from);
  }
  if (to) await user.type(screen.getByLabelText("Ends on"), to);
  if (categories.length > 0) {
    await user.click(screen.getByRole("button", { name: /^Categories/ }));
    for (const category of categories) {
      await user.click(screen.getByRole("checkbox", { name: category }));
    }
  }
  if (accounts.length > 0) {
    await user.click(screen.getByRole("button", { name: /^Accounts/ }));
    for (const account of accounts) {
      await user.click(screen.getByRole("checkbox", { name: account }));
    }
  }
  if (carryOverspent) await user.click(screen.getByLabelText(/Carry overspending over/));
  await user.click(screen.getByRole("button", { name: "Add budget" }));
  await screen.findByRole("heading", { name, level: 1 });
}

// On the budget's own screen, reached from the budgets list.
async function expectStanding(name: string, standing: RegExp) {
  await openBudget(name);
  await waitFor(() =>
    expect(screen.getByRole("region", { name: "This period" }).textContent).toMatch(standing),
  );
}

async function expectPastPeriod(name: string, spentOfLimit: string, share: string) {
  await openBudget(name);
  const past = within(await screen.findByRole("region", { name: "Past periods" }));
  expect(await past.findByText(spentOfLimit)).toBeTruthy();
  expect(past.getByText(share)).toBeTruthy();
}

// From the transactions list, saving whatever `change` does to the form.
async function editVet(change: () => Promise<void>) {
  await user.click(defined(screen.getAllByRole("link", { name: "Transactions" })[0]));
  await user.click(await screen.findByRole("link", { name: /Vet/ }));
  await screen.findByRole("heading", { name: "Vet", level: 1 });
  await change();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Saved.");
}

async function openBudget(name: string) {
  await user.click(defined(screen.getAllByRole("link", { name: "Budgets" })[0]));
  await user.click(await screen.findByRole("link", { name: new RegExp(`^${name}`) }));
  await screen.findByRole("heading", { name, level: 1 });
}
