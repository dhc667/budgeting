// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAccount,
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
  // A fixed budget's dates; otherwise it repeats monthly from today.
  from?: string;
  to?: string;
};

async function addBudget({ name, limit, categories = [], from, to }: NewBudget) {
  await user.click(defined(screen.getAllByRole("link", { name: "Budgets" })[0]));
  await user.click(await screen.findByRole("link", { name: "New budget" }));
  await screen.findByRole("heading", { name: "New budget", level: 1 });
  await user.type(screen.getByLabelText("Name"), name);
  await user.type(screen.getByLabelText("Limit"), limit);
  if (from && to) {
    await user.click(screen.getByLabelText("Between two dates"));
    await user.clear(screen.getByLabelText("Starts on"));
    await user.type(screen.getByLabelText("Starts on"), from);
    await user.type(screen.getByLabelText("Ends on"), to);
  }
  if (categories.length > 0) {
    await user.click(screen.getByRole("button", { name: /^Categories/ }));
    for (const category of categories) {
      await user.click(screen.getByRole("checkbox", { name: category }));
    }
  }
  await user.click(screen.getByRole("button", { name: "Add budget" }));
  await screen.findByRole("heading", { name, level: 1 });
}

// On the budget's own screen, reached from the budgets list.
async function expectStanding(name: string, standing: RegExp) {
  await user.click(defined(screen.getAllByRole("link", { name: "Budgets" })[0]));
  await user.click(await screen.findByRole("link", { name: new RegExp(`^${name}`) }));
  await screen.findByRole("heading", { name, level: 1 });
  await waitFor(() =>
    expect(screen.getByRole("region", { name: "This period" }).textContent).toMatch(standing),
  );
}
