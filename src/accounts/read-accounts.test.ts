import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import { readAccountHistory, readAccounts } from "./read-accounts";

type Ledger = RowOf<"ledger_accounts">;
type Posting = RowOf<"postings">;
type Entry = RowOf<"activity">;

describe("reading accounts", () => {
  it("sums an account's postings, opening balance included", () => {
    const accounts = readAccounts(
      rows({
        ledgers: [bank, openingCategory, food],
        transactions: [
          { id: "open", date: "2026-01-01" },
          { id: "lunch", date: "2026-01-05" },
        ],
        postings: [
          posting("open", bank.id, 10_000),
          posting("open", openingCategory.id, -10_000),
          posting("lunch", bank.id, -1_500),
          posting("lunch", food.id, 1_500),
        ],
      }),
    );

    expect(accounts).toEqual([
      expect.objectContaining({
        id: bank.id,
        balance: 8_500,
        opening_balance: 10_000,
        opening_date: "2026-01-01",
        has_transactions: true,
      }),
    ]);
  });

  it("has no transactions while only its opening balance is posted", () => {
    const [account] = readAccounts(
      rows({
        ledgers: [bank, openingCategory],
        transactions: [{ id: "open", date: "2026-01-01" }],
        postings: [posting("open", bank.id, 500), posting("open", openingCategory.id, -500)],
      }),
    );

    expect(account).toMatchObject({ balance: 500, has_transactions: false });
  });

  it("opens an account without money at zero and with no date", () => {
    const [account] = readAccounts(rows({ ledgers: [bank, openingCategory] }));

    expect(account).toMatchObject({
      balance: 0,
      opening_balance: 0,
      opening_date: null,
      has_transactions: false,
    });
  });

  it("leaves categories and opening balance categories out", () => {
    const accounts = readAccounts(rows({ ledgers: [bank, openingCategory, food] }));

    expect(accounts.map(({ id }) => id)).toEqual([bank.id]);
  });

  it("takes each account's opening balance from its own space's opening category", () => {
    const otherBank: Ledger = { ...bank, id: "bank-2", space_id: "space-2" };
    const otherOpening: Ledger = { ...openingCategory, id: "opening-2", space_id: "space-2" };

    const accounts = readAccounts(
      rows({
        ledgers: [bank, openingCategory, otherBank, otherOpening],
        transactions: [
          { id: "open-1", date: "2026-01-01" },
          { id: "open-2", date: "2026-02-01" },
        ],
        postings: [
          posting("open-1", bank.id, 100),
          posting("open-1", openingCategory.id, -100),
          posting("open-2", otherBank.id, 200),
          posting("open-2", otherOpening.id, -200),
        ],
      }),
    );

    expect(
      accounts.map(({ id, opening_balance, opening_date }) => [id, opening_balance, opening_date]),
    ).toEqual([
      [bank.id, 100, "2026-01-01"],
      [otherBank.id, 200, "2026-02-01"],
    ]);
  });

  it("orders accounts by position, then by when they were created", () => {
    const first: Ledger = {
      ...bank,
      id: "a",
      position: 1,
      created_at: "2026-01-02T00:00:00+00:00",
    };
    const second: Ledger = {
      ...bank,
      id: "b",
      position: 1,
      created_at: "2026-01-01T00:00:00+00:00",
    };
    const third: Ledger = {
      ...bank,
      id: "c",
      position: 0,
      created_at: "2026-01-03T00:00:00+00:00",
    };

    const accounts = readAccounts(rows({ ledgers: [first, second, third] }));

    expect(accounts.map(({ id }) => id)).toEqual(["c", "b", "a"]);
  });
});

describe("reading an account's history", () => {
  it("has the account's own changes and the transactions that touched it, newest first", () => {
    const history = readAccountHistory(
      {
        activity: byId([
          entry(1, "ledger_accounts", bank.id),
          entry(2, "ledger_accounts", "other"),
          entry(3, "transactions", "t1", { new: { postings: [{ ledger_account_id: bank.id }] } }),
          entry(4, "transactions", "t2", { old: { postings: [{ ledger_account_id: bank.id }] } }),
          entry(5, "transactions", "t3", { new: { postings: [{ ledger_account_id: "other" }] } }),
        ]),
      },
      bank.id,
    );

    expect(history.map(({ id }) => id)).toEqual([4, 3, 1]);
  });
});

const bank: Ledger = {
  id: "bank",
  space_id: "space-1",
  kind: "account",
  name: "Bank",
  currency: "USD",
  color: "blue",
  icon: null,
  parent_id: null,
  built_in: null,
  position: 0,
  archived: false,
  created_at: "2026-01-01T00:00:00+00:00",
  came_with_space: false,
  version: 1,
};
const openingCategory: Ledger = {
  ...bank,
  id: "opening",
  kind: "opening_balance",
  name: null,
  currency: null,
  color: null,
};
const food: Ledger = { ...bank, id: "food", kind: "expense", icon: "utensils" };

function rows({
  ledgers = [],
  transactions = [],
  postings = [],
}: {
  ledgers?: Ledger[];
  transactions?: { id: string; date: string }[];
  postings?: Posting[];
}) {
  return {
    ledger_accounts: byId(ledgers),
    transactions: byId(
      transactions.map(({ id, date }) => ({
        id,
        date,
        title: null,
        note: null,
        created_at: "2026-01-01T00:00:00+00:00",
        created_by: "u1",
        version: 1,
      })),
    ),
    postings: byId(postings),
  };
}

let postingCount = 0;
function posting(transaction_id: string, ledger_account_id: string, amount: number): Posting {
  return {
    id: `p${postingCount++}`,
    transaction_id,
    ledger_account_id,
    amount,
    currency: "USD",
    version: 1,
  };
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
