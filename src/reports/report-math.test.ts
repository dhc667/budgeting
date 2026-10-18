import { describe, expect, it } from "vitest";
import type { LatestRates, RateHistory } from "../rates/convert";
import { netWorth } from "../rates/net-worth";
import type { DateRange } from "../format/days";
import type { DisplayConversion } from "../rates/convert-dated";
import { allTime } from "./periods";
import { categoryTotals, incomeVsExpense, netWorthSeries } from "./report-math";
import type { AccountMovement, CategoryFlow, FlowCategory } from "./read-reports";

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
    const result = spending(
      [
        flow({ category: "Food", net: 100 }),
        flow({ category: "Food", net: -30, day: "2026-01-20" }),
        flow({ category: "Rent", net: 500, day: "2026-01-31" }),
        flow({ category: "Fun", net: 40, day: "2026-02-01" }),
        flow({ category: "Pay", kind: "income", net: 900 }),
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
    const result = spending(
      [
        flow({ category: "Before", net: 1, day: "2025-12-31" }),
        flow({ category: "First", net: 10, day: "2026-01-01" }),
        flow({ category: "Last", net: 100, day: "2026-01-31" }),
        flow({ category: "After", net: 1_000, day: "2026-02-01" }),
      ],
      period,
      display,
    );

    expect(result.categories.map(({ name }) => name)).toEqual(["Last", "First"]);
    expect(result.total).toBe(110);
  });

  it("leaves a side of the period open when its bound is empty", () => {
    const flows = [
      flow({ category: "Old", net: 1, day: "2020-01-01" }),
      flow({ category: "New", net: 10, day: "2030-01-01" }),
    ];

    expect(spending(flows, { from: "", to: "2026-01-01" }, display).total).toBe(1);
    expect(spending(flows, { from: "2026-01-01", to: "" }, display).total).toBe(10);
    expect(spending(flows, allTime, display).total).toBe(11);
  });

  it("shares the spending out among the categories, none to one refunded more than it spent", () => {
    const result = spending(
      [
        flow({ category: "Rent", net: 300 }),
        flow({ category: "Food", net: 100 }),
        flow({ category: "Gift", net: -200 }),
      ],
      period,
      display,
    );

    expect(result.categories.map(({ name, share }) => [name, share])).toEqual([
      ["Rent", 0.75],
      ["Food", 0.25],
      ["Gift", 0],
    ]);
  });

  it("totals income the same way, when asked for it", () => {
    const flows = [
      flow({ category: "Salary", kind: "income", net: 900 }),
      flow({ category: "Rent", net: 500 }),
    ];

    const result = categoryTotals(flows, "income", period, display);

    expect(result.categories.map(({ name, amount }) => [name, amount])).toEqual([["Salary", 900]]);
    expect(result.total).toBe(900);
  });

  it("counts a subcategory in its category, and lists it under it", () => {
    const result = spending(
      [
        flow({ category: "Food", net: 100 }),
        flow({ category: "Food", subcategory: "Snacks", net: 300 }),
        flow({ category: "Food", subcategory: "Coffee", net: 200 }),
        flow({ category: "Rent", net: 400 }),
      ],
      period,
      display,
    );

    expect(result.categories.map(({ name, amount, share }) => [name, amount, share])).toEqual([
      ["Food", 600, 0.6],
      ["Rent", 400, 0.4],
    ]);
    expect(result.categories[0]?.subcategories.map(({ name, share }) => [name, share])).toEqual([
      ["Snacks", 0.3],
      ["Coffee", 0.2],
    ]);
  });

  it("slices by subcategory, each category keeping a slice for what it took outside them", () => {
    const result = spending(
      [
        flow({ category: "Food", net: 100 }),
        flow({ category: "Food", subcategory: "Snacks", net: 300 }),
        flow({ category: "Rent", net: 400 }),
        flow({ category: "Fun", subcategory: "Games", net: 200 }),
      ],
      period,
      display,
    );

    expect(result.subcategorySlices.map(({ id, name, share }) => [id, name, share])).toEqual([
      ["snacks", "Snacks", 0.3],
      ["food", "Food", 0.1],
      ["rent", "Rent", 0.4],
      ["games", "Games", 0.2],
    ]);
  });

  it("converts each flow at the rate of its own day", () => {
    const result = spending(
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
    const result = spending(
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

// What was spent in the period, with the arguments in the order of every call below.
function spending(flows: CategoryFlow[], period: DateRange, conversion: DisplayConversion) {
  return categoryTotals(flows, "expense", period, conversion);
}

type FlowOverrides = Partial<Omit<CategoryFlow, "category" | "subcategory">> & {
  category?: string;
  subcategory?: string;
};

function flow({ category = "Food", subcategory, ...overrides }: FlowOverrides): CategoryFlow {
  return {
    day: "2026-01-10",
    currency: "USD",
    kind: "expense",
    category: named(category),
    subcategory: subcategory === undefined ? null : named(subcategory),
    net: 0,
    ...overrides,
  };
}

function named(name: string): FlowCategory {
  return { id: name.toLowerCase(), name, icon: "tag", color: "blue", spaceId: "space-1" };
}

function move(overrides: Partial<AccountMovement>): AccountMovement {
  return { accountId: "bank", currency: "USD", day: "2026-01-01", amount: 0, ...overrides };
}
