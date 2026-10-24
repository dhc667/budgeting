import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import {
  readRecentTransactions,
  readTitleSuggestions,
  readTransaction,
  readTransactionHistory,
  readTransactionPage,
  readTransactions,
} from "./read-transactions";

type Ledger = RowOf<"ledger_accounts">;
type Posting = RowOf<"postings">;
type Entry = RowOf<"activity">;
type Tx = RowOf<"transactions">;

describe("reading a transaction", () => {
  it("shows an expense leaving a money account for a category", () => {
    const transaction = readTransaction(
      rows({ txs: [tx("lunch")], postings: pay("lunch", bank, food, 1_500) }),
      "lunch",
    );

    expect(transaction).toMatchObject({
      id: "lunch",
      type: "expense",
      one_sided: false,
      from_account_id: "bank",
      from_amount: 1_500,
      from_currency: "USD",
      to_account_id: null,
      category_id: "food",
      space_ids: ["space-1"],
    });
  });

  it("is a refund when money comes back from an expense category", () => {
    const transaction = readTransaction(
      rows({ txs: [tx("back")], postings: pay("back", food, bank, 300) }),
      "back",
    );

    expect(transaction).toMatchObject({ type: "refund", to_account_id: "bank", to_amount: 300 });
  });

  it("is income when money arrives from an income category", () => {
    const transaction = readTransaction(
      rows({ txs: [tx("pay")], postings: pay("pay", salary, bank, 900) }),
      "pay",
    );

    expect(transaction).toMatchObject({ type: "income", category_id: "salary", one_sided: false });
  });

  it("is a transfer between two money accounts, with both sides", () => {
    const transaction = readTransaction(
      rows({ txs: [tx("move")], postings: pay("move", bank, savings, 700) }),
      "move",
    );

    expect(transaction).toMatchObject({
      type: "transfer",
      one_sided: false,
      from_account_id: "bank",
      to_account_id: "savings",
      category_id: null,
    });
  });

  it("is a forgiven debt when what a counterparty owed passes through an account", () => {
    const forgaveIt = readTransaction(
      rows({
        ledgers: [bank, charlie, forgiven],
        txs: [tx("let go")],
        postings: [pay("let go", charlie, bank, 400), pay("let go", bank, forgiven, 400)],
      }),
      "let go",
    );
    const wasForgiven = readTransaction(
      rows({
        ledgers: [bank, charlie, forgivenToYou],
        txs: [tx("let off")],
        postings: [pay("let off", bank, charlie, 400), pay("let off", forgivenToYou, bank, 400)],
      }),
      "let off",
    );

    expect(forgaveIt).toMatchObject({
      type: "forgave",
      from_account_id: "bank",
      to_account_id: "bank",
      from_amount: 400,
      category_id: "forgiven",
      counterparty_id: "charlie",
    });
    expect(wasForgiven).toMatchObject({ type: "forgiven", counterparty_id: "charlie" });
  });

  it("is a one-sided transfer when only one of its postings is visible", () => {
    const sentOnly = readTransaction(
      rows({ txs: [tx("move")], postings: [post("move", bank, -700)] }),
      "move",
    );
    const receivedOnly = readTransaction(
      rows({ txs: [tx("move")], postings: [post("move", savings, 700)] }),
      "move",
    );

    expect(sentOnly).toMatchObject({
      type: "transfer",
      one_sided: true,
      from_account_id: "bank",
      to_account_id: null,
    });
    expect(receivedOnly).toMatchObject({
      type: "transfer",
      one_sided: true,
      from_account_id: null,
      to_account_id: "savings",
    });
  });

  it("lists the spaces its postings are in, once each", () => {
    const transaction = readTransaction(
      rows({
        ledgers: [bank, shared],
        txs: [tx("move")],
        postings: [pay("move", bank, shared, 50)],
      }),
      "move",
    );

    expect(transaction?.space_ids).toEqual(["space-1", "space-2"]);
  });

  it("is absent when unknown, and for an opening balance", () => {
    const copy = rows({
      txs: [tx("open")],
      postings: [post("open", bank, 100), post("open", opening, -100)],
    });

    expect(readTransaction(copy, "nope")).toBeNull();
    expect(readTransaction(copy, "open")).toBeNull();
    expect(readTransactions(copy, {})).toEqual([]);
  });
});

describe("listing transactions", () => {
  const copy = rows({
    txs: [
      tx("old", { date: "2026-01-01" }),
      tx("new-late", { date: "2026-02-01", created_at: "2026-02-01T10:00:00+00:00" }),
      tx("new-early", { date: "2026-02-01", created_at: "2026-02-01T09:00:00+00:00" }),
      tx("cafe", { date: "2026-01-15", title: "Café Olé", note: "with 100% milk_" }),
    ],
    postings: [
      pay("old", bank, food, 1),
      pay("new-late", bank, food, 2),
      pay("new-early", savings, salary, 3),
      pay("cafe", bank, shared, 4),
    ],
  });

  it("is newest first by date, then creation", () => {
    expect(ids(readTransactions(copy, {}))).toEqual(["new-late", "new-early", "cafe", "old"]);
  });

  it("narrows by space, account, category and inclusive dates", () => {
    expect(ids(readTransactions(copy, { spaceIds: ["space-2"] }))).toEqual(["cafe"]);
    expect(ids(readTransactions(copy, { accountIds: ["savings"] }))).toEqual(["new-early"]);
    expect(ids(readTransactions(copy, { categoryIds: ["food"] }))).toEqual(["new-late", "old"]);
    expect(ids(readTransactions(copy, { from: "2026-01-15", to: "2026-02-01" }))).toEqual([
      "new-late",
      "new-early",
      "cafe",
    ]);
    expect(readTransactions(copy, { spaceIds: [] })).toEqual([]);
  });

  it("searches title and note ignoring case and accents, taking wildcards literally", () => {
    expect(ids(readTransactions(copy, { search: " CAFE ole" }))).toEqual(["cafe"]);
    expect(ids(readTransactions(copy, { search: "café" }))).toEqual(["cafe"]);
    expect(ids(readTransactions(copy, { search: "100%" }))).toEqual(["cafe"]);
    expect(readTransactions(copy, { search: "%" })).toHaveLength(1);
    expect(readTransactions(copy, { search: "milk_" })).toHaveLength(1);
    expect(readTransactions(copy, { search: "milkx" })).toEqual([]);
  });

  it("does not match across the title and the note", () => {
    const joined = rows({
      txs: [tx("a", { title: "tea", note: "bag" })],
      postings: [pay("a", bank, food, 1)],
    });

    expect(readTransactions(joined, { search: "teabag" })).toEqual([]);
  });

  it("gives the newest few for recent", () => {
    expect(ids(readRecentTransactions(copy, ["space-1", "space-2"], 2))).toEqual([
      "new-late",
      "new-early",
    ]);
  });
});

describe("a page of the list", () => {
  const copy = rows({
    ledgers: [bank, savings, food, salary, charlie],
    txs: [
      tx("lunch", { date: "2026-02-02" }),
      tx("back", { date: "2026-02-02" }),
      tx("pay", { date: "2026-02-02" }),
      tx("move", { date: "2026-02-02" }),
      tx("lent", { date: "2026-02-02" }),
      tx("euros", { date: "2026-02-02" }),
      tx("older", { date: "2026-02-01" }),
    ],
    postings: [
      pay("lunch", bank, food, 1_500),
      pay("back", food, bank, 300),
      pay("pay", salary, bank, 10_000),
      pay("move", bank, savings, 700),
      pay("lent", bank, charlie, 2_000),
      inEuros(pay("euros", bank, food, 400)),
      pay("older", bank, food, 100),
    ],
  });

  it("totals what each day earned less what it spent, in each currency, but not transfers or debts", () => {
    expect(readTransactionPage(copy, {}, 50).days).toEqual([
      {
        day: "2026-02-02",
        count: 6,
        flows: [
          { currency: "USD", net: 8_800 },
          { currency: "EUR", net: -400 },
        ],
      },
      { day: "2026-02-01", count: 1, flows: [{ currency: "USD", net: -100 }] },
    ]);
  });

  it("counts and totals a day the page cuts short over all of its matches", () => {
    const page = readTransactionPage(copy, {}, 2);

    expect(page.transactions).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.days).toEqual([expect.objectContaining({ day: "2026-02-02", count: 6 })]);
  });

  it("totals only what the filter lets through", () => {
    expect(readTransactionPage(copy, { categoryIds: ["food"] }, 50).days).toEqual([
      {
        day: "2026-02-02",
        count: 3,
        flows: [
          { currency: "USD", net: -1_200 },
          { currency: "EUR", net: -400 },
        ],
      },
      { day: "2026-02-01", count: 1, flows: [{ currency: "USD", net: -100 }] },
    ]);
  });
});

describe("title suggestions", () => {
  const me = "u1";

  it("keeps the user's latest transaction of each title and category", () => {
    const suggestions = readTitleSuggestions(
      rows({
        txs: [
          tx("first", { title: "Lunch", date: "2026-01-01" }),
          tx("second", { title: "lunch", date: "2026-01-02" }),
          tx("other-cat", { title: "Lunch", date: "2026-01-03" }),
          tx("theirs", { title: "Taxi", created_by: "u2" }),
          tx("untitled", { title: null }),
        ],
        postings: [
          pay("first", bank, food, 1),
          pay("second", bank, food, 2),
          pay("other-cat", bank, rent, 3),
          pay("theirs", bank, food, 4),
          pay("untitled", bank, food, 5),
        ],
      }),
      me,
    );

    expect(ids(suggestions)).toEqual(["other-cat", "second"]);
  });

  it("tells an expense from a refund of the same category", () => {
    const suggestions = readTitleSuggestions(
      rows({
        txs: [tx("spent", { title: "Shop" }), tx("returned", { title: "Shop" })],
        postings: [pay("spent", bank, food, 1), pay("returned", food, bank, 1)],
      }),
      me,
    );

    expect(suggestions.map(({ type }) => type).sort()).toEqual(["expense", "refund"]);
  });

  it("tells transfers apart by their accounts", () => {
    const suggestions = readTitleSuggestions(
      rows({
        txs: [tx("a", { title: "Move" }), tx("b", { title: "Move" }), tx("c", { title: "Move" })],
        postings: [
          pay("a", bank, savings, 1),
          pay("b", bank, savings, 2),
          pay("c", savings, bank, 3),
        ],
      }),
      me,
    );

    expect(ids(suggestions)).toEqual(["c", "b"]);
  });

  it("leaves out a transfer the user sees one side of", () => {
    const suggestions = readTitleSuggestions(
      rows({ txs: [tx("half", { title: "Move" })], postings: [post("half", bank, -5)] }),
      me,
    );

    expect(suggestions).toEqual([]);
  });
});

describe("a transaction's history", () => {
  it("is one entry for a change logged in each space, newest first", () => {
    const history = readTransactionHistory(
      {
        activity: byId([
          entry(1, "t1", "insert", { new: snapshot("space-1", [{ amount: 5 }]) }),
          entry(
            2,
            "t1",
            "update",
            {
              old: snapshot("space-1", [{ amount: 5 }]),
              new: snapshot("space-1", [{ amount: 6 }]),
            },
            "space-1",
          ),
          entry(
            3,
            "t1",
            "update",
            {
              old: { ...snapshot("space-2", [{ amount: -5 }]), other_space: "to" },
              new: { ...snapshot("space-2", [{ amount: -6 }]), other_space: "to" },
            },
            "space-2",
          ),
          entry(4, "t2", "insert", {}),
        ]),
      },
      "t1",
    );

    expect(history.map(({ id, action }) => [id, action])).toEqual([
      [2, "update"],
      [1, "insert"],
    ]);
    expect(history[0]?.new).toEqual({
      space: "space-1",
      postings: [{ amount: 6 }, { amount: -6 }],
    });
    expect(history[0]?.old).toEqual({
      space: "space-1",
      postings: [{ amount: 5 }, { amount: -5 }],
    });
  });

  it("keeps the side of a member of only one space as it was logged", () => {
    const [only] = readTransactionHistory(
      {
        activity: byId([
          entry(1, "t1", "insert", {
            new: { ...snapshot("space-1", [{ amount: 5 }]), other_space: "to" },
          }),
        ]),
      },
      "t1",
    );

    expect(only?.new).toEqual({ space: "space-1", postings: [{ amount: 5 }], other_space: "to" });
    expect(only?.old).toBeNull();
  });
});

const ledger = (id: string, kind: Ledger["kind"], space_id = "space-1"): Ledger => ({
  id,
  space_id,
  kind,
  name: kind === "opening_balance" ? null : id,
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
});
const bank = ledger("bank", "account");
const savings = ledger("savings", "account");
const shared = ledger("shared", "account", "space-2");
const food = ledger("food", "expense");
const rent = ledger("rent", "expense");
const salary = ledger("salary", "income");
const opening = ledger("opening", "opening_balance");
const charlie = ledger("charlie", "counterparty");
const forgiven = {
  ...ledger("forgiven", "expense"),
  name: null,
  built_in: "debts_forgiven" as const,
};
const forgivenToYou = {
  ...ledger("forgiven-to-you", "income"),
  name: null,
  built_in: "debts_forgiven_to_you" as const,
};

function rows({
  ledgers = [bank, savings, shared, food, rent, salary, opening],
  txs = [],
  postings = [],
}: {
  ledgers?: Ledger[];
  txs?: Tx[];
  postings?: (Posting | Posting[])[];
}) {
  return {
    ledger_accounts: keyed(ledgers),
    transactions: keyed(txs),
    postings: keyed(postings.flat()),
  };
}

function tx(id: string, overrides: Partial<Tx> = {}): Tx {
  return {
    id,
    date: "2026-01-01",
    title: null,
    note: null,
    created_at: "2026-01-01T00:00:00+00:00",
    created_by: "u1",
    version: 1,
    ...overrides,
  };
}

let postingCount = 0;
function post(transaction_id: string, on: Ledger, amount: number): Posting {
  return {
    id: `p${postingCount++}`,
    transaction_id,
    ledger_account_id: on.id,
    amount,
    currency: "USD",
    version: 1,
  };
}

function pay(transaction_id: string, from: Ledger, to: Ledger, amount: number): Posting[] {
  return [post(transaction_id, from, -amount), post(transaction_id, to, amount)];
}

function inEuros(postings: Posting[]): Posting[] {
  return postings.map((posting) => ({ ...posting, currency: "EUR" }));
}

function entry(
  id: number,
  row_id: string,
  action: Entry["action"],
  snapshots: { old?: Entry["old"]; new?: Entry["new"] },
  space_id = "space-1",
): Entry {
  return {
    id,
    table_name: "transactions",
    row_id,
    space_id,
    action,
    changed_by: "u1",
    changed_at: "2026-01-01T00:00:00+00:00",
    old: snapshots.old ?? null,
    new: snapshots.new ?? null,
    version: 1,
  };
}

function snapshot(space: string, postings: { amount: number }[]) {
  return { space, postings };
}

function ids(transactions: { id: string }[]): string[] {
  return transactions.map(({ id }) => id);
}

function keyed<Row extends { id: string }>(items: Row[]): ReadonlyMap<string, Row> {
  return new Map(items.map((item) => [JSON.stringify([item.id]), item]));
}

function byId(items: Entry[]): ReadonlyMap<string, Entry> {
  return new Map(items.map((item) => [String(item.id), item]));
}
