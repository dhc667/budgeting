import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import {
  readBudgetExclusions,
  readBudgetHistory,
  readBudgetSpending,
  readBudgets,
} from "./read-budgets";

type Ledger = RowOf<"ledger_accounts">;
type Posting = RowOf<"postings">;
type Budget = RowOf<"budgets">;

describe("budget spending", () => {
  it("sums what was spent per day and currency, oldest first", () => {
    const spending = readBudgetSpending(
      rows({
        txs: [tx("b", "2026-01-02"), tx("a", "2026-01-01"), tx("c", "2026-01-01")],
        postings: [
          ...pay("b", bank, food, 300),
          ...pay("a", bank, food, 100),
          ...pay("c", bank, food, 250),
          ...pay("c", bank, rent, 50, "EUR"),
        ],
      }),
      "budget",
    );

    expect(spending).toEqual([
      { spent_on: "2026-01-01", currency: "EUR", amount: 50 },
      { spent_on: "2026-01-01", currency: "USD", amount: 350 },
      { spent_on: "2026-01-02", currency: "USD", amount: 300 },
    ]);
  });

  it("counts every expense category of its space when it names none", () => {
    const spending = readBudgetSpending(
      rows({
        txs: [tx("a"), tx("b"), tx("c")],
        postings: [
          ...pay("a", bank, food, 100),
          ...pay("b", bank, rent, 200),
          ...pay("c", bank, abroad, 400),
        ],
      }),
      "budget",
    );

    expect(spending).toEqual([{ spent_on: "2026-01-01", currency: "USD", amount: 300 }]);
  });

  it("counts a named category and its subcategories only", () => {
    const spending = readBudgetSpending(
      rows({
        budget: budget({ category_ids: ["food"] }),
        txs: [tx("a"), tx("b"), tx("c")],
        postings: [
          ...pay("a", bank, food, 100),
          ...pay("b", bank, snacks, 20),
          ...pay("c", bank, rent, 200),
        ],
      }),
      "budget",
    );

    expect(spending).toEqual([{ spent_on: "2026-01-01", currency: "USD", amount: 120 }]);
  });

  it("counts only transactions paid from one of the listed accounts", () => {
    const spending = readBudgetSpending(
      rows({
        budget: budget({ account_ids: ["bank"] }),
        txs: [tx("a"), tx("b")],
        postings: [...pay("a", bank, food, 100), ...pay("b", savings, food, 900)],
      }),
      "budget",
    );

    expect(spending).toEqual([{ spent_on: "2026-01-01", currency: "USD", amount: 100 }]);
  });

  it("leaves out transactions excluded from the budget, but not from another", () => {
    const spending = readBudgetSpending(
      rows({
        txs: [tx("a"), tx("b")],
        postings: [...pay("a", bank, food, 100), ...pay("b", bank, food, 900)],
        exclusions: [
          { budget_id: "budget", transaction_id: "b", version: 1 },
          { budget_id: "other", transaction_id: "a", version: 1 },
        ],
      }),
      "budget",
    );

    expect(spending).toEqual([{ spent_on: "2026-01-01", currency: "USD", amount: 100 }]);
  });

  it("takes refunds off what was spent", () => {
    const spending = readBudgetSpending(
      rows({
        txs: [tx("a"), tx("back")],
        postings: [...pay("a", bank, food, 1_000), ...pay("back", food, bank, 300)],
      }),
      "budget",
    );

    expect(spending).toEqual([{ spent_on: "2026-01-01", currency: "USD", amount: 700 }]);
  });

  it("counts transactions from the start date to the end date, both included", () => {
    const spending = readBudgetSpending(
      rows({
        budget: budget({ starts_on: "2026-01-10", ends_on: "2026-01-20" }),
        txs: [
          tx("before", "2026-01-09"),
          tx("first", "2026-01-10"),
          tx("last", "2026-01-20"),
          tx("after", "2026-01-21"),
        ],
        postings: [
          ...pay("before", bank, food, 1),
          ...pay("first", bank, food, 10),
          ...pay("last", bank, food, 100),
          ...pay("after", bank, food, 1_000),
        ],
      }),
      "budget",
    );

    expect(spending.map(({ spent_on, amount }) => [spent_on, amount])).toEqual([
      ["2026-01-10", 10],
      ["2026-01-20", 100],
    ]);
  });

  it("has no end when ends_on is null, so a late transaction still counts", () => {
    const spending = readBudgetSpending(
      rows({
        budget: budget({ ends_on: null }),
        txs: [tx("early", "2026-01-01"), tx("late", "2031-12-31")],
        postings: [...pay("early", bank, food, 10), ...pay("late", bank, food, 20)],
      }),
      "budget",
    );

    expect(spending.map(({ spent_on, amount }) => [spent_on, amount])).toEqual([
      ["2026-01-01", 10],
      ["2031-12-31", 20],
    ]);
  });

  it("combines a listed parent's subcategories with the account filter", () => {
    const spending = readBudgetSpending(
      rows({
        budget: budget({ category_ids: ["food"], account_ids: ["bank"] }),
        txs: [tx("a"), tx("b"), tx("c")],
        postings: [
          ...pay("a", bank, snacks, 20),
          ...pay("b", savings, snacks, 900),
          ...pay("c", bank, rent, 200),
        ],
      }),
      "budget",
    );

    expect(spending).toEqual([{ spent_on: "2026-01-01", currency: "USD", amount: 20 }]);
  });

  it("is empty for a budget the copy doesn't hold", () => {
    expect(readBudgetSpending(rows({}), "missing")).toEqual([]);
  });
});

describe("listing budgets", () => {
  it("orders them by name, then by when they were created", () => {
    const budgets = readBudgets({
      budgets: new Map(
        [
          budget({ id: "late", name: "Food", created_at: "2026-02-01T00:00:00+00:00" }),
          budget({ id: "z", name: "Zoo" }),
          budget({ id: "early", name: "Food" }),
          budget({ id: "a", name: "Art" }),
        ].map((each) => [JSON.stringify([each.id]), each]),
      ),
    });

    expect(budgets.map(({ id }) => id)).toEqual(["a", "early", "late", "z"]);
  });
});

describe("a budget's history and exclusions", () => {
  it("shows the budget's own activity, newest first", () => {
    const activity = new Map(
      [entry(1, "budget"), entry(2, "other"), entry(3, "budget")].map((each) => [
        String(each.id),
        each,
      ]),
    );

    expect(readBudgetHistory({ activity }, "budget").map(({ id }) => id)).toEqual([3, 1]);
  });

  it("lists the budgets a transaction is left out of", () => {
    const budget_exclusions = new Map(
      [
        { budget_id: "b1", transaction_id: "t1", version: 1 },
        { budget_id: "b2", transaction_id: "t2", version: 1 },
      ].map((each) => [JSON.stringify([each.budget_id, each.transaction_id]), each]),
    );

    expect(readBudgetExclusions({ budget_exclusions }, "t1")).toEqual(["b1"]);
  });
});

function entry(id: number, row_id: string): RowOf<"activity"> {
  return {
    id,
    table_name: "budgets",
    row_id,
    space_id: "space-1",
    action: "update",
    changed_by: "u1",
    changed_at: "2026-01-01T00:00:00+00:00",
    old: null,
    new: null,
    version: 1,
  };
}

const ledger = (id: string, kind: Ledger["kind"], overrides: Partial<Ledger> = {}): Ledger => ({
  id,
  space_id: "space-1",
  kind,
  name: id,
  currency: kind === "account" ? "USD" : null,
  color: null,
  icon: null,
  parent_id: null,
  built_in: null,
  position: 0,
  archived: false,
  created_at: "2026-01-01T00:00:00+00:00",
  came_with_space: false,
  version: 1,
  ...overrides,
});
const bank = ledger("bank", "account");
const savings = ledger("savings", "account");
const food = ledger("food", "expense");
const snacks = ledger("snacks", "expense", { parent_id: "food" });
const rent = ledger("rent", "expense");
const abroad = ledger("abroad", "expense", { space_id: "space-2" });

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "budget",
    space_id: "space-1",
    name: "Budget",
    currency: "USD",
    amount: 1_000,
    starts_on: "2026-01-01",
    ends_on: null,
    every: null,
    unit: null,
    carry_unspent: false,
    carry_overspent: false,
    category_ids: null,
    account_ids: null,
    created_at: "2026-01-01T00:00:00+00:00",
    version: 1,
    ...overrides,
  };
}

function rows({
  budget: own = budget(),
  txs = [],
  postings = [],
  exclusions = [],
}: {
  budget?: Budget;
  txs?: RowOf<"transactions">[];
  postings?: Posting[];
  exclusions?: RowOf<"budget_exclusions">[];
}) {
  return {
    budgets: keyed([own]),
    ledger_accounts: keyed([bank, savings, food, snacks, rent, abroad]),
    transactions: keyed(txs),
    postings: keyed(postings),
    budget_exclusions: new Map(
      exclusions.map((each) => [JSON.stringify([each.budget_id, each.transaction_id]), each]),
    ),
  };
}

function tx(id: string, date = "2026-01-01"): RowOf<"transactions"> {
  return {
    id,
    date,
    title: null,
    note: null,
    created_at: "2026-01-01T00:00:00+00:00",
    created_by: "u1",
    version: 1,
  };
}

let postingCount = 0;
function pay(
  transaction_id: string,
  from: Ledger,
  to: Ledger,
  amount: number,
  currency = "USD",
): Posting[] {
  return [
    {
      id: `p${postingCount++}`,
      transaction_id,
      ledger_account_id: from.id,
      amount: -amount,
      currency,
      version: 1,
    },
    {
      id: `p${postingCount++}`,
      transaction_id,
      ledger_account_id: to.id,
      amount,
      currency,
      version: 1,
    },
  ];
}

function keyed<Row extends { id: string }>(items: Row[]): ReadonlyMap<string, Row> {
  return new Map(items.map((item) => [JSON.stringify([item.id]), item]));
}
