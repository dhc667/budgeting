import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import { readAccountMovements, readCategoryFlows } from "./read-reports";

type Ledger = RowOf<"ledger_accounts">;
type Posting = RowOf<"postings">;

describe("category flows", () => {
  it("counts a refund against the category's spending", () => {
    const flows = readCategoryFlows(
      rows({
        txs: [tx("buy"), tx("return", "2026-01-03")],
        postings: [...move("buy", bank, food, 100), ...move("return", food, bank, 30)],
      }),
      ["space-1"],
      builtInName,
    );

    expect(flows).toEqual([
      expect.objectContaining({ day: "2026-01-01", kind: "expense", net: 100 }),
      expect.objectContaining({ day: "2026-01-03", kind: "expense", net: -30 }),
    ]);
  });

  it("names a subcategory's parent as its category", () => {
    const flows = readCategoryFlows(
      rows({
        txs: [tx("a"), tx("b")],
        postings: [...move("a", bank, food, 100), ...move("b", bank, snacks, 25)],
      }),
      ["space-1"],
      builtInName,
    );

    expect(
      flows.map(({ category, subcategory, net }) => [category.id, subcategory?.id, net]),
    ).toEqual([
      ["food", undefined, 100],
      ["food", "snacks", 25],
    ]);
  });

  it("counts money earned as positive income, net of anything paid back", () => {
    const flows = readCategoryFlows(
      rows({
        txs: [tx("pay"), tx("back")],
        postings: [...move("pay", salary, bank, 500), ...move("back", bank, salary, 50)],
      }),
      ["space-1"],
      builtInName,
    );

    expect(flows).toEqual([expect.objectContaining({ kind: "income", net: 450 })]);
  });

  it("counts a forgiven debt in its built-in category, under the name it's given", () => {
    const flows = readCategoryFlows(
      rows({
        txs: [tx("forgave")],
        postings: [...move("forgave", dad, bank, 300), ...move("forgave", bank, forgiven, 300)],
      }),
      ["space-1"],
      builtInName,
    );

    expect(flows.map(({ kind, category, net }) => [kind, category.name, net])).toEqual([
      ["expense", "built-in debts_forgiven", 300],
    ]);
  });

  it("leaves out opening balances and transfers", () => {
    const flows = readCategoryFlows(
      rows({
        txs: [tx("open"), tx("move")],
        postings: [...move("open", opening, bank, 1_000), ...move("move", bank, savings, 200)],
      }),
      ["space-1"],
      builtInName,
    );

    expect(flows).toEqual([]);
  });

  it("keeps a day's flows in each currency apart, and counts only the spaces given", () => {
    const all = rows({
      txs: [tx("a"), tx("b"), tx("c")],
      postings: [
        ...move("a", bank, food, 100),
        ...move("b", bank, food, 40, "EUR"),
        ...move("c", bank, abroad, 70),
      ],
    });

    expect(
      readCategoryFlows(all, ["space-1"], builtInName).map(({ currency, net }) => [currency, net]),
    ).toEqual([
      ["USD", 100],
      ["EUR", 40],
    ]);
    expect(readCategoryFlows(all, ["space-2"], builtInName).map(({ net }) => net)).toEqual([70]);
  });
});

describe("account movements", () => {
  it("sums what each account gained on a day, opening balances and archived accounts included", () => {
    const movements = readAccountMovements(
      rows({
        txs: [tx("open"), tx("a"), tx("b", "2026-01-02")],
        postings: [
          ...move("open", opening, bank, 1_000),
          ...move("a", bank, food, 100),
          ...move("b", bank, food, 50),
          ...move("open", opening, archivedAccount, 70),
        ],
      }),
      ["space-1"],
    );

    expect(movements).toEqual([
      { accountId: "bank", currency: "USD", day: "2026-01-01", amount: 900 },
      { accountId: "bank", currency: "USD", day: "2026-01-02", amount: -50 },
      { accountId: "archived", currency: "USD", day: "2026-01-01", amount: 70 },
    ]);
  });

  it("counts only the accounts of the spaces given", () => {
    const movements = readAccountMovements(
      rows({ txs: [tx("a")], postings: move("a", abroadAccount, abroad, 70) }),
      ["space-1"],
    );

    expect(movements).toEqual([]);
  });
});

const ledger = (id: string, kind: Ledger["kind"], overrides: Partial<Ledger> = {}): Ledger => ({
  id,
  space_id: "space-1",
  kind,
  name: id,
  currency: kind === "account" ? "USD" : null,
  color: kind === "opening_balance" ? null : "blue",
  icon: kind === "expense" || kind === "income" ? "tag" : null,
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
const archivedAccount = ledger("archived", "account", { archived: true });
const abroadAccount = ledger("abroad-account", "account", { space_id: "space-2" });
const opening = ledger("opening", "opening_balance");
const food = ledger("food", "expense");
const snacks = ledger("snacks", "expense", { parent_id: "food" });
const abroad = ledger("abroad", "expense", { space_id: "space-2" });
const salary = ledger("salary", "income");
const dad = ledger("dad", "counterparty", { color: "blue" });
const forgiven = ledger("forgiven", "expense", { name: null, built_in: "debts_forgiven" });

function rows({ txs, postings }: { txs: RowOf<"transactions">[]; postings: Posting[] }) {
  return {
    ledger_accounts: keyed([
      bank,
      savings,
      archivedAccount,
      abroadAccount,
      opening,
      food,
      snacks,
      abroad,
      salary,
      dad,
      forgiven,
    ]),
    transactions: keyed(txs),
    postings: keyed(postings),
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
function move(
  transaction_id: string,
  from: Ledger,
  to: Ledger,
  amount: number,
  currency = "USD",
): Posting[] {
  return [from, to].map((side, index) => ({
    id: `p${postingCount++}`,
    transaction_id,
    ledger_account_id: side.id,
    amount: index === 0 ? -amount : amount,
    currency,
    version: 1,
  }));
}

function builtInName(builtIn: string): string {
  return `built-in ${builtIn}`;
}

function keyed<Row extends { id: string }>(items: Row[]): ReadonlyMap<string, Row> {
  return new Map(items.map((item) => [JSON.stringify([item.id]), item]));
}
