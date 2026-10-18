import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import { readCategories, readCategoryHistory } from "./read-categories";

type Ledger = RowOf<"ledger_accounts">;
type Entry = RowOf<"activity">;

describe("reading categories", () => {
  it("has expense and income categories only", () => {
    const categories = readCategories({
      ledger_accounts: byId([food, salary, bank, opening]),
      postings: byId([]),
    });

    expect(categories.map(({ id, kind }) => [id, kind])).toEqual([
      ["food", "expense"],
      ["salary", "income"],
    ]);
  });

  it("counts each transaction with a posting on the category once", () => {
    const categories = readCategories({
      ledger_accounts: byId([food, salary]),
      postings: byId([
        posting("p1", "t1", "food"),
        posting("p2", "t1", "food"),
        posting("p3", "t2", "food"),
        posting("p4", "t3", "salary"),
      ]),
    });

    expect(categories.map(({ id, transaction_count }) => [id, transaction_count])).toEqual([
      ["food", 2],
      ["salary", 1],
    ]);
  });
});

describe("reading a category's history", () => {
  it("has its changes and deletes that moved transactions into it, newest first", () => {
    const history = readCategoryHistory(
      {
        activity: byId([
          entry(1, "ledger_accounts", "food"),
          entry(2, "ledger_accounts", "salary"),
          entry(3, "ledger_accounts", "snacks", { old: { moved_to: { id: "food" } } }),
          entry(4, "ledger_accounts", "snacks", { old: { moved_to: { id: "salary" } } }),
          entry(5, "transactions", "food"),
        ]),
      },
      "food",
    );

    expect(history.map(({ id }) => id)).toEqual([3, 1]);
  });
});

const food: Ledger = {
  id: "food",
  space_id: "space-1",
  kind: "expense",
  name: "Food",
  currency: null,
  color: "red",
  icon: "utensils",
  parent_id: null,
  position: 0,
  archived: false,
  created_at: "2026-01-01T00:00:00+00:00",
  came_with_space: false,
  version: 1,
};
const salary: Ledger = { ...food, id: "salary", kind: "income", name: "Salary" };
const bank: Ledger = { ...food, id: "bank", kind: "account", currency: "USD", icon: null };
const opening: Ledger = { ...food, id: "opening", kind: "opening_balance", name: null };

function posting(id: string, transaction_id: string, ledger_account_id: string) {
  return { id, transaction_id, ledger_account_id, amount: 1, currency: "USD", version: 1 };
}

function entry(
  id: number,
  table_name: string,
  row_id: string,
  snapshots: { old?: Entry["old"]; new?: Entry["new"] } = {},
): Entry {
  return {
    id,
    table_name,
    row_id,
    space_id: "space-1",
    action: "update",
    changed_by: null,
    changed_at: "2026-01-01T00:00:00+00:00",
    old: snapshots.old ?? null,
    new: snapshots.new ?? null,
    version: 1,
  };
}

function byId<Row extends { id: string | number }>(items: Row[]): ReadonlyMap<string, Row> {
  return new Map(items.map((item) => [String(item.id), item]));
}
