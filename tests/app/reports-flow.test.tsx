// @vitest-environment jsdom
import type { BoundFunctions, queries } from "@testing-library/dom";
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defined } from "../../cli/defined";
import { lastMonth } from "../../src/reports/periods";
import {
  addAccount,
  goHome,
  openSignedIn,
  recordTransaction,
  uniqueName,
  user,
} from "../support/app";
import { daysAgo, today } from "../support/dates";
import { signedInAs, sql } from "../support/local-instance";
import { addRates } from "../support/rates";

vi.mock("../../src/rates/rates-provider", async () => {
  const { offlineProvider } = await import("../support/rates-provider");
  return offlineProvider;
});

// Worth 2 dollars until two days ago, and 4 after: 1 dollar buys 2, then 4.
const shifting = "XSD";
const unrated = "XSC";

beforeEach(async () => {
  localStorage.clear();
  await sql`insert into public.currencies (code, decimals)
    values (${shifting}, 2), (${unrated}, 2) on conflict do nothing`;
  await sql`delete from public.exchange_rates where currency in (${shifting}, ${unrated})`;
  await sql`insert into public.exchange_rates (date, currency, rate) values
    (${daysAgo(10)}, ${shifting}, 2), (${daysAgo(2)}, ${shifting}, 4)`;
});

afterEach(cleanup);
afterAll(() => sql.end());

describe("spending by category", () => {
  it("totals each category over the chosen period, net of refunds", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await recordTransaction({ amount: "100", category: "Groceries" });
    await recordTransaction({ type: "Refund", amount: "30", category: "Groceries" });
    await recordTransaction({ amount: "20", category: "Transport" });
    await recordTransaction({ amount: "40", category: "Groceries", date: endOfLastMonth() });
    await openReports();

    const card = await spendingCard();
    expect(amountOf(card, "Groceries")).toBe("$70.00");
    expect(amountOf(card, "Transport")).toBe("$20.00");
    expect(totalOf(card)).toBe("$90.00");

    await user.click(card.getByRole("button", { name: "Last month" }));
    expect(amountOf(card, "Groceries")).toBe("$40.00");
    expect(card.queryByText("Transport")).toBeNull();
    expect(totalOf(card)).toBe("$40.00");

    await user.clear(card.getByLabelText("From"));
    await user.type(card.getByLabelText("From"), daysAgo(0));
    await user.clear(card.getByLabelText("To"));
    await user.type(card.getByLabelText("To"), daysAgo(0));
    expect(totalOf(card)).toBe("$90.00");

    await user.click(card.getByRole("button", { name: "All time" }));
    expect(amountOf(card, "Groceries")).toBe("$110.00");
    expect(totalOf(card)).toBe("$130.00");
    expect(card.getByRole("button", { name: "All time", pressed: true })).toBeTruthy();
  });

  it("shows a chosen category alone, with its transactions over the period", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await recordTransaction({ amount: "75", category: "Groceries", title: "Market" });
    await recordTransaction({ amount: "25", category: "Transport", title: "Bus" });
    await recordTransaction({
      amount: "10",
      category: "Groceries",
      title: "Old market",
      date: endOfLastMonth(),
    });
    await openReports();

    const card = await spendingCard();
    expect(within(categoryRow(card, "Groceries")).getByText("75%")).toBeTruthy();
    await user.click(categoryRow(card, "Groceries"));

    expect(categoryRow(card, "Groceries").getAttribute("aria-pressed")).toBe("true");
    expect(card.queryByRole("button", { name: /^Transport/ })).toBeNull();
    expect(await card.findByText("Market")).toBeTruthy();
    expect(card.queryByText("Bus")).toBeNull();
    expect(card.queryByText("Old market")).toBeNull();

    await user.click(card.getByRole("button", { name: "Clear the chosen category" }));
    expect(categoryRow(card, "Transport")).toBeTruthy();
    expect(card.queryByText("Market")).toBeNull();
  });

  it("totals income by category on its own tab", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await recordTransaction({ type: "Income", amount: "500", category: "Salary" });
    await recordTransaction({ amount: "100", category: "Groceries" });
    await openReports();

    const card = await spendingCard();
    await user.click(card.getByRole("tab", { name: "Income" }));

    expect(amountOf(card, "Salary")).toBe("$500.00");
    expect(card.queryByText("Groceries")).toBeNull();
    expect(defined(card.getByText("Total earned").nextElementSibling?.textContent)).toBe("$500.00");
  });

  it("lists subcategories under their category, and narrows to one when chosen", async () => {
    const { email } = await openSignedIn(uniqueName("Ana"));
    await addSubcategory(email, "Groceries", "Bakery");
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await recordTransaction({ amount: "60", category: "Groceries", title: "Market" });
    await recordTransaction({ amount: "40", category: "Groceries › Bakery", title: "Bread" });
    await openReports();

    const card = await spendingCard();
    expect(amountOf(card, "Groceries")).toBe("$100.00");
    expect(card.queryByText("Bakery")).toBeNull();

    await user.click(card.getByRole("button", { name: "Show subcategories" }));
    expect(within(categoryRow(card, "Bakery")).getByText("$40.00")).toBeTruthy();

    await user.click(categoryRow(card, "Bakery"));
    expect(await card.findByText("Bread")).toBeTruthy();
    expect(card.queryByText("Market")).toBeNull();
  });

  it("converts each transaction at the rate of its own day, and says what it couldn't convert", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await addAccount({ name: "Shifting", openingBalance: "0", currency: shifting });
    await addAccount({ name: "Havana", openingBalance: "0", currency: unrated });
    await recordTransaction({
      amount: "400",
      account: "Shifting",
      category: "Groceries",
      date: daysAgo(5),
    });
    await recordTransaction({ amount: "400", account: "Shifting", category: "Groceries" });
    await recordTransaction({ amount: "50", account: "Havana", category: "Groceries" });
    await openReports();

    const card = await spendingCard();
    await user.clear(card.getByLabelText("From"));
    await user.type(card.getByLabelText("From"), daysAgo(6));

    expect(amountOf(card, "Groceries")).toBe("$300.00");
    expect(card.getByText(`Not counted, no exchange rate for its day: ${unrated}`)).toBeTruthy();
  });
});

describe("income vs. expense", () => {
  it("totals each month, leaving opening balances out", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await recordTransaction({ type: "Income", amount: "500", category: "Salary" });
    await recordTransaction({ amount: "100", category: "Groceries" });
    await recordTransaction({ type: "Refund", amount: "30", category: "Groceries" });
    await recordTransaction({ amount: "40", category: "Groceries", date: endOfLastMonth() });
    await openReports();

    const card = within(await screen.findByRole("region", { name: "Income vs. expense" }));
    const rows = card.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(12);
    expect(cellsOf(defined(rows.at(-1)))).toEqual(["$500.00", "$70.00", "$430.00"]);
    expect(cellsOf(defined(rows.at(-2)))).toEqual(["$0.00", "$40.00", "-$40.00"]);
    expect(cellsOf(defined(rows.at(0)))).toEqual(["$0.00", "$0.00", "$0.00"]);
  });
});

describe("net worth over time", () => {
  it("ends at the net worth the dashboard shows", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addRates("XSB");
    await addAccount({ name: "Checking", openingBalance: "1000" });
    await addAccount({ name: "Abroad", openingBalance: "150", currency: "XSB" });
    await addAccount({ name: "Havana", openingBalance: "7", currency: unrated });
    await recordTransaction({ amount: "100", account: "Checking", category: "Groceries" });
    await recordTransaction({
      type: "Income",
      amount: "25",
      account: "Checking",
      category: "Salary",
    });
    await recordTransaction({
      amount: "10",
      account: "Checking",
      category: "Groceries",
      date: daysAgo(3),
    });

    await goHome();
    const dashboard = within(await screen.findByRole("region", { name: "Net worth" }));
    expect(await dashboard.findByText("$1,015.00")).toBeTruthy();

    await openReports();
    const card = within(await screen.findByRole("region", { name: "Net worth over time" }));
    expect((await card.findByText("Today")).nextSibling?.textContent).toBe("$1,015.00");
    expect(card.getByText(`Not counted, no exchange rate for its day: ${unrated}`)).toBeTruthy();
  });

  it("says there is nothing to show before anything is recorded", async () => {
    await openSignedIn(uniqueName("Ana"));
    await openReports();

    const card = within(await screen.findByRole("region", { name: "Net worth over time" }));
    expect(await card.findByText("Nothing recorded yet.")).toBeTruthy();
  });
});

async function openReports() {
  await user.click(defined((await screen.findAllByRole("link", { name: "Reports" }))[0]));
  await screen.findByRole("heading", { name: "Reports", level: 1 });
}

async function spendingCard() {
  return within(await screen.findByRole("region", { name: "By category" }));
}

function categoryRow(card: Card, name: string): HTMLElement {
  return card.getByRole("button", { name: new RegExp(`^${name}\\$`) });
}

async function addSubcategory(email: string, parentName: string, name: string) {
  const client = await signedInAs(email);
  const [parent] = await sql<{ id: string; space_id: string }[]>`select c.id, c.space_id
    from public.ledger_accounts c
    join public.spaces s on s.id = c.space_id join auth.users u on u.id = s.private_owner
    where u.email = ${email} and c.name = ${parentName}`;
  const { error } = await client.rpc("create_category", {
    space: defined(parent).space_id,
    category_name: name,
    category_kind: "expense",
    category_icon: "tag",
    category_color: "blue",
    parent: defined(parent).id,
  });
  if (error) throw error;
}

function amountOf(card: Card, category: string): string {
  const row = defined(card.getByText(category).closest("li"));
  return defined(within(row).getByText(/^-?\$[\d,.]+$/).textContent);
}

function totalOf(card: Card): string {
  return defined(card.getByText("Total spent").nextElementSibling?.textContent);
}

function cellsOf(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent ?? "");
}

function endOfLastMonth(): string {
  return lastMonth(today()).to;
}

type Card = BoundFunctions<typeof queries>;
