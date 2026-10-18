import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import { readRecurringHistory, readRecurringTransactions } from "./read-recurring";

describe("recurring transactions", () => {
  it("lists the rules in the order they were created", () => {
    const recurring_transactions = new Map(
      [rule("second", "2026-02-01T00:00:00+00:00"), rule("first", "2026-01-01T00:00:00+00:00")].map(
        (each) => [JSON.stringify([each.id]), each],
      ),
    );

    expect(readRecurringTransactions({ recurring_transactions }).map(({ id }) => id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("shows a rule's own activity, newest first", () => {
    const activity = new Map(
      [
        entry(1, "rule", "recurring_transactions"),
        entry(2, "rule", "budgets"),
        entry(3, "other", "recurring_transactions"),
        entry(4, "rule", "recurring_transactions"),
      ].map((each) => [String(each.id), each]),
    );

    expect(readRecurringHistory({ activity }, "rule").map(({ id }) => id)).toEqual([4, 1]);
  });
});

function entry(id: number, row_id: string, table_name: string): RowOf<"activity"> {
  return {
    id,
    table_name,
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

function rule(id: string, created_at: string): RowOf<"recurring_transactions"> {
  return {
    id,
    created_at,
    created_by: "u1",
    space_id: "space-1",
    account_id: "bank",
    to_account_id: null,
    to_amount: null,
    category_id: "food",
    type: "expense",
    amount: 100,
    title: null,
    note: null,
    starts_on: "2026-01-01",
    every: 1,
    unit: "month",
    ends_on: null,
    times: null,
    done: 0,
    paused: false,
    version: 1,
  };
}
