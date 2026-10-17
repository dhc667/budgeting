import { describe, expect, it } from "vitest";
import { type BudgetPlan, budgetPeriods, currentPeriod, dailyAllowance } from "./periods";

function monthly(overrides: Partial<BudgetPlan> = {}): BudgetPlan {
  return {
    limit: 100_00,
    startsOn: "2026-01-25",
    length: { kind: "repeating", every: 1, unit: "month" },
    carryUnspent: false,
    carryOverspent: false,
    ...overrides,
  };
}

describe("a repeating budget's periods", () => {
  it("run from its start day to the day before the next, up to the one holding today", () => {
    expect(budgetPeriods(monthly(), [], "2026-03-10")).toEqual([
      { start: "2026-01-25", end: "2026-02-24", limit: 100_00, spent: 0 },
      { start: "2026-02-25", end: "2026-03-24", limit: 100_00, spent: 0 },
    ]);
  });

  it("start on the start day itself, and the next one on its own start day", () => {
    expect(budgetPeriods(monthly(), [], "2026-02-25").map(({ start }) => start)).toEqual([
      "2026-01-25",
      "2026-02-25",
    ]);
  });

  it("come back to a month-end start day after a shorter month", () => {
    const periods = budgetPeriods(monthly({ startsOn: "2026-01-31" }), [], "2026-04-01");

    expect(periods.map(({ start, end }) => [start, end])).toEqual([
      ["2026-01-31", "2026-02-27"],
      ["2026-02-28", "2026-03-30"],
      ["2026-03-31", "2026-04-29"],
    ]);
  });

  it("repeat every few weeks too", () => {
    const plan = monthly({
      startsOn: "2026-03-02",
      length: { kind: "repeating", every: 2, unit: "week" },
    });

    expect(budgetPeriods(plan, [], "2026-03-20").map(({ start, end }) => [start, end])).toEqual([
      ["2026-03-02", "2026-03-15"],
      ["2026-03-16", "2026-03-29"],
    ]);
  });

  it("are just the first, before the budget starts", () => {
    expect(budgetPeriods(monthly(), [], "2026-01-01")).toEqual([
      { start: "2026-01-25", end: "2026-02-24", limit: 100_00, spent: 0 },
    ]);
  });

  it("each count what was spent within them, refunds taking it back", () => {
    const spending = [
      { day: "2026-01-24", amount: 5_00 },
      { day: "2026-01-25", amount: 30_00 },
      { day: "2026-02-24", amount: 20_00 },
      { day: "2026-02-25", amount: 40_00 },
      { day: "2026-03-01", amount: -15_00 },
    ];

    expect(budgetPeriods(monthly(), spending, "2026-03-10").map(({ spent }) => spent)).toEqual([
      50_00, 25_00,
    ]);
  });
});

describe("a fixed budget", () => {
  it("has one period, from its start to its end, however far today is", () => {
    const plan = monthly({
      startsOn: "2026-06-01",
      length: { kind: "fixed", endsOn: "2026-06-20" },
    });

    expect(budgetPeriods(plan, [{ day: "2026-06-05", amount: 12_00 }], "2026-12-01")).toEqual([
      { start: "2026-06-01", end: "2026-06-20", limit: 100_00, spent: 12_00 },
    ]);
  });
});

describe("carry-over", () => {
  const spending = [
    { day: "2026-01-30", amount: 70_00 },
    { day: "2026-03-01", amount: 140_00 },
    { day: "2026-03-30", amount: 50_00 },
  ];
  const limits = (plan: BudgetPlan) =>
    budgetPeriods(plan, spending, "2026-04-30").map(({ limit }) => limit);

  it("is off unless enabled: every period gets the same limit", () => {
    expect(limits(monthly())).toEqual([100_00, 100_00, 100_00, 100_00]);
  });

  it("of unspent money raises the next limit, and keeps adding up", () => {
    // 30 left, then 130 - 140 = -10 isn't carried, then 50 left.
    expect(limits(monthly({ carryUnspent: true }))).toEqual([100_00, 130_00, 100_00, 150_00]);
  });

  it("of overspending lowers the next limit", () => {
    // 100 - 140 = -40 carried; 60 - 50 = 10 left isn't.
    expect(limits(monthly({ carryOverspent: true }))).toEqual([100_00, 100_00, 60_00, 100_00]);
  });

  it("both ways follow every period's ending", () => {
    // +30, then 130 - 140 = -10, then 90 - 50 = +40.
    expect(limits(monthly({ carryUnspent: true, carryOverspent: true }))).toEqual([
      100_00, 130_00, 90_00, 140_00,
    ]);
  });

  it("can take a limit below zero after a big overspend", () => {
    const overspent = [{ day: "2026-01-30", amount: 250_00 }];
    const plan = monthly({ carryOverspent: true });

    expect(budgetPeriods(plan, overspent, "2026-03-10").map(({ limit }) => limit)).toEqual([
      100_00, -50_00,
    ]);
  });
});

describe("the current period", () => {
  it("is the one holding today, and none before the start or after a fixed end", () => {
    const periods = budgetPeriods(monthly(), [], "2026-03-10");

    expect(currentPeriod(periods, "2026-03-10")?.start).toBe("2026-02-25");
    expect(currentPeriod(budgetPeriods(monthly(), [], "2026-01-01"), "2026-01-01")).toBeUndefined();
  });
});

describe("the daily allowance", () => {
  const period = { start: "2026-03-01", end: "2026-03-10", limit: 100_00, spent: 0 };

  it("spreads what's left over the days left, today included", () => {
    expect(dailyAllowance(period, "2026-03-01")).toEqual({
      kind: "per-day",
      amount: 10_00,
      daysLeft: 10,
    });
    expect(dailyAllowance({ ...period, spent: 40_00 }, "2026-03-07")).toEqual({
      kind: "per-day",
      amount: 15_00,
      daysLeft: 4,
    });
  });

  it("is everything left on the last day", () => {
    expect(dailyAllowance({ ...period, spent: 93_50 }, "2026-03-10")).toEqual({
      kind: "per-day",
      amount: 6_50,
      daysLeft: 1,
    });
  });

  it("drops as soon as money goes today", () => {
    expect(dailyAllowance({ ...period, spent: 19_00 }, "2026-03-02")).toMatchObject({
      amount: 9_00,
    });
  });

  it("rounds down to the smallest unit", () => {
    expect(dailyAllowance({ ...period, limit: 100 }, "2026-03-04")).toMatchObject({
      amount: 14,
      daysLeft: 7,
    });
  });

  it("is zero with exactly the limit spent, and over beyond it", () => {
    expect(dailyAllowance({ ...period, spent: 100_00 }, "2026-03-05")).toMatchObject({
      kind: "per-day",
      amount: 0,
    });
    expect(dailyAllowance({ ...period, spent: 100_01 }, "2026-03-05")).toEqual({
      kind: "over",
      daysLeft: 6,
    });
  });

  it("is over when carried overspending leaves a limit below zero", () => {
    expect(dailyAllowance({ ...period, limit: -5_00 }, "2026-03-05")).toMatchObject({
      kind: "over",
    });
  });

  it("doesn't exist outside the period", () => {
    expect(dailyAllowance(period, "2026-02-28")).toBeNull();
    expect(dailyAllowance(period, "2026-03-11")).toBeNull();
  });
});
