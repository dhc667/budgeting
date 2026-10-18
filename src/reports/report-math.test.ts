import { describe, expect, it } from "vitest";
import type { LatestRates, RateHistory } from "../rates/convert";
import { netWorth } from "../rates/net-worth";
import type { DisplayConversion } from "../rates/convert-dated";
import { incomeVsExpense, netWorthSeries, spendingByCategory } from "./report-math";
import type { AccountMovement, CategoryFlow } from "./read-reports";

const usd = { code: "USD", decimals: 2 };
const currencies = [usd, { code: "EUR", decimals: 2 }, { code: "CUP", decimals: 2 }];
// A euro is worth 2 dollars until February, and 4 after.
const history: RateHistory = new Map([
  [
    "EUR",
    [
      { date: "2026-01-01", rate: 0.5 },
      { date: "2026-02-01", rate: 0.25 },
    ],
  ],
]);
const display: DisplayConversion = { currencies, currency: usd, history };

describe("spending by category", () => {
  const period = { from: "2026-01-01", to: "2026-01-31" };

  it("totals each category over the period, biggest first, net of refunds", () => {
    const result = spendingByCategory(
      [
        flow({ categoryId: "food", categoryName: "Food", net: 100 }),
        flow({ categoryId: "food", categoryName: "Food", net: -30, day: "2026-01-20" }),
        flow({ categoryId: "rent", categoryName: "Rent", net: 500, day: "2026-01-31" }),
        flow({ categoryId: "fun", categoryName: "Fun", net: 40, day: "2026-02-01" }),
        flow({ categoryId: "pay", kind: "income", net: 900 }),
      ],
      period,
      display,
    );

    expect(result.categories.map(({ name, amount }) => [name, amount])).toEqual([
      ["Rent", 500],
      ["Food", 70],
    ]);
    expect(result.total).toBe(570);
    expect(result.missing).toEqual([]);
  });

  it("counts a day exactly on either end of the period, and none outside it", () => {
    const result = spendingByCategory(
      [
        flow({ categoryId: "before", categoryName: "Before", net: 1, day: "2025-12-31" }),
        flow({ categoryId: "first", categoryName: "First", net: 10, day: "2026-01-01" }),
        flow({ categoryId: "last", categoryName: "Last", net: 100, day: "2026-01-31" }),
        flow({ categoryId: "after", categoryName: "After", net: 1_000, day: "2026-02-01" }),
      ],
      period,
      display,
    );

    expect(result.categories.map(({ name }) => name)).toEqual(["Last", "First"]);
    expect(result.total).toBe(110);
  });

  it("converts each flow at the rate of its own day", () => {
    const result = spendingByCategory(
      [
        flow({ currency: "EUR", net: 100, day: "2026-01-10" }),
        flow({ currency: "EUR", net: 100, day: "2026-02-10" }),
      ],
      { from: "2026-01-01", to: "2026-02-28" },
      display,
    );

    expect(result.total).toBe(200 + 400);
  });

  it("leaves out a currency without a rate on the day, naming its first such day", () => {
    const result = spendingByCategory(
      [
        flow({ net: 100 }),
        flow({ currency: "CUP", net: 7_000, day: "2026-01-20" }),
        flow({ currency: "CUP", net: 7_000, day: "2026-01-05" }),
        flow({ currency: "EUR", net: 10, day: "2025-12-31" }),
      ],
      { from: "2025-12-01", to: "2026-01-31" },
      display,
    );

    expect(result.total).toBe(100);
    expect(result.missing).toEqual([
      { currency: "CUP", day: "2026-01-05" },
      { currency: "EUR", day: "2025-12-31" },
    ]);
  });
});

describe("income vs. expense", () => {
  it("totals income and expense per month and their difference", () => {
    const result = incomeVsExpense(
      [
        flow({ kind: "income", net: 1_000, day: "2026-01-02" }),
        flow({ kind: "expense", net: 300, day: "2026-01-15" }),
        flow({ kind: "expense", net: -50, day: "2026-01-16" }),
        flow({ kind: "expense", currency: "EUR", net: 100, day: "2026-02-03" }),
        flow({ kind: "income", net: 5, day: "2025-12-31" }),
      ],
      ["2026-01", "2026-02", "2026-03"],
      display,
    );

    expect(result.months).toEqual([
      { month: "2026-01", income: 1_000, expense: 250, difference: 750 },
      { month: "2026-02", income: 0, expense: 400, difference: -400 },
      { month: "2026-03", income: 0, expense: 0, difference: 0 },
    ]);
  });

  it("leaves out what has no rate", () => {
    const result = incomeVsExpense(
      [flow({ currency: "CUP", net: 9, day: "2026-01-02" })],
      ["2026-01"],
      display,
    );

    expect(result.months[0]).toMatchObject({ income: 0, expense: 0 });
    expect(result.missing).toEqual([{ currency: "CUP", day: "2026-01-02" }]);
  });
});

describe("net worth over time", () => {
  it("has a point per day from the first movement, each converted at that day's rate", () => {
    const result = netWorthSeries(
      [
        move({ accountId: "bank", amount: 1_000, day: "2026-01-30" }),
        move({ accountId: "euros", currency: "EUR", amount: 100, day: "2026-01-31" }),
        move({ accountId: "bank", amount: -250, day: "2026-02-02" }),
      ],
      "2026-02-02",
      display,
    );

    expect(result.points).toEqual([
      { day: "2026-01-30", total: 1_000 },
      { day: "2026-01-31", total: 1_200 },
      { day: "2026-02-01", total: 1_400 },
      { day: "2026-02-02", total: 1_150 },
    ]);
  });

  it("leaves an account out of the days before its currency's first rate, and names the first", () => {
    const result = netWorthSeries(
      [
        move({ accountId: "bank", amount: 100, day: "2025-12-30" }),
        move({ accountId: "euros", currency: "EUR", amount: 100, day: "2025-12-30" }),
      ],
      "2026-01-02",
      display,
    );

    expect(result.points).toEqual([
      { day: "2025-12-30", total: 100 },
      { day: "2025-12-31", total: 100 },
      { day: "2026-01-01", total: 300 },
      { day: "2026-01-02", total: 300 },
    ]);
    expect(result.missing).toEqual([{ currency: "EUR", day: "2025-12-30" }]);
  });

  it("has no points before anything is recorded", () => {
    expect(netWorthSeries([], "2026-02-02", display)).toEqual({ points: [], missing: [] });
  });

  it("leaves out an account's currency on days it has no rate, and names the first one", () => {
    const result = netWorthSeries(
      [
        move({ accountId: "bank", amount: 100, day: "2026-01-01" }),
        move({ accountId: "havana", currency: "CUP", amount: 9_000, day: "2026-01-02" }),
      ],
      "2026-01-03",
      display,
    );

    expect(result.points.map(({ total }) => total)).toEqual([100, 100, 100]);
    expect(result.missing).toEqual([{ currency: "CUP", day: "2026-01-02" }]);
  });

  it("ends at the net worth the dashboard shows, future-dated movements included", () => {
    const movements = [
      move({ accountId: "bank", amount: 1_001, day: "2026-01-10" }),
      move({ accountId: "euros", currency: "EUR", amount: 333, day: "2026-01-20" }),
      move({ accountId: "euros", currency: "EUR", amount: 1, day: "2026-03-01" }),
    ];
    const latest: LatestRates = new Map([
      ["EUR", { currency: "EUR", date: "2026-02-01", rate: 0.25, stale: false }],
    ]);

    const { points } = netWorthSeries(movements, "2026-02-15", display);
    const card = netWorth(
      [
        { name: "bank", currency: "USD", balance: 1_001 },
        { name: "euros", currency: "EUR", balance: 334 },
      ],
      currencies,
      usd,
      latest,
    );

    expect(points.at(-1)?.total).toBe(card.total);
  });
});

function flow(overrides: Partial<CategoryFlow>): CategoryFlow {
  return {
    day: "2026-01-10",
    currency: "USD",
    kind: "expense",
    categoryId: "food",
    categoryName: "Food",
    spaceId: "space-1",
    net: 0,
    ...overrides,
  };
}

function move(overrides: Partial<AccountMovement>): AccountMovement {
  return { accountId: "bank", currency: "USD", day: "2026-01-01", amount: 0, ...overrides };
}
