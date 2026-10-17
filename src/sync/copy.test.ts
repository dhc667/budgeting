import { describe, expect, it } from "vitest";
import { applyPull, type Changes, type LocalCopy } from "./copy";

type Currency = Changes["rows"]["currencies"][number];
type ExchangeRate = Changes["rows"]["exchange_rates"][number];
type Posting = Changes["rows"]["postings"][number];
type Transaction = Changes["rows"]["transactions"][number];
type Exclusion = Changes["rows"]["budget_exclusions"][number];

const schemaVersion = 7;

describe("applying a pull", () => {
  it("builds the first copy from everything pulled", () => {
    const { copy } = applied(null, pull({ version: 10, rows: { currencies: [eur, usd] } }));

    expect(rowsOf(copy, "currencies")).toEqual([eur, usd]);
    expect(copy).toMatchObject({ version: 10, spaceIds: ["space-1"], schemaVersion });
  });

  it("replaces a row it already has and adds new ones", () => {
    const first = applied(null, pull({ rows: { currencies: [eur] } })).copy;

    const { copy } = applied(
      first,
      pull({ rows: { currencies: [{ ...eur, decimals: 3, version: 5 }, usd] } }),
    );

    expect(rowsOf(copy, "currencies")).toEqual([{ ...eur, decimals: 3, version: 5 }, usd]);
  });

  it("removes a deleted row", () => {
    const first = applied(null, pull({ rows: { currencies: [eur, usd] } })).copy;

    const { copy } = applied(
      first,
      pull({ deleted: [{ table: "currencies", key: { code: "EUR" } }] }),
    );

    expect(rowsOf(copy, "currencies")).toEqual([usd]);
  });

  it("keeps a row that is both deleted and in the rows, as a restored transaction is", () => {
    const first = applied(
      null,
      pull({ rows: { transactions: [lunch], postings: [lunchPosting] } }),
    ).copy;
    const restored = { ...lunch, version: 9 };

    const { copy } = applied(
      first,
      pull({
        rows: { transactions: [restored], postings: [lunchPosting] },
        deleted: [{ table: "transactions", key: { id: lunch.id } }],
      }),
    );

    expect(rowsOf(copy, "transactions")).toEqual([restored]);
  });

  it("tells rows with composite keys apart by every column of the key", () => {
    const first = applied(
      null,
      pull({ rows: { exchange_rates: [eurToday, eurYesterday, usdToday] } }),
    ).copy;

    const { copy } = applied(
      first,
      pull({
        rows: { exchange_rates: [{ ...eurToday, rate: 2 }] },
        deleted: [{ table: "exchange_rates", key: { date: "2026-01-01", currency: "USD" } }],
      }),
    );

    expect(rowsOf(copy, "exchange_rates")).toEqual([{ ...eurToday, rate: 2 }, eurYesterday]);
  });

  it("deletes a row by a composite key sent in either column order", () => {
    const excluded: Exclusion = { budget_id: "b", transaction_id: "t", version: 1 };
    const first = applied(null, pull({ rows: { budget_exclusions: [excluded] } })).copy;

    const { copy } = applied(
      first,
      pull({
        deleted: [{ table: "budget_exclusions", key: { transaction_id: "t", budget_id: "b" } }],
      }),
    );

    expect(rowsOf(copy, "budget_exclusions")).toEqual([]);
  });

  it("starts over when the pull says reset", () => {
    const first = applied(null, pull({ rows: { currencies: [eur, usd] } })).copy;

    const { copy } = applied(first, pull({ reset: true, version: 3, rows: { currencies: [usd] } }));

    expect(rowsOf(copy, "currencies")).toEqual([usd]);
    expect(copy.version).toBe(3);
  });

  it("drops a transaction it holds no postings for", () => {
    const first = applied(
      null,
      pull({ rows: { transactions: [lunch], postings: [lunchPosting] } }),
    ).copy;

    const { copy } = applied(
      first,
      pull({ deleted: [{ table: "postings", key: { id: lunchPosting.id } }] }),
    );

    expect(rowsOf(copy, "transactions")).toEqual([]);
  });

  it("asks to pull again from the start when the spaces differ, whatever the order", () => {
    const first = applied(null, pull({ spaceIds: ["a", "b"] })).copy;

    expect(applyPull(first, pull({ spaceIds: ["b", "a"] }), schemaVersion).outcome).toBe("applied");
    expect(applyPull(first, pull({ spaceIds: ["a"] }), schemaVersion).outcome).toBe("repull");
    expect(applyPull(first, pull({ spaceIds: ["a", "b", "c"] }), schemaVersion).outcome).toBe(
      "repull",
    );
  });

  it("reports no change for a pull that only moves the version", () => {
    const first = applied(null, pull({ rows: { currencies: [eur] } })).copy;

    const next = applied(first, pull({ version: 50, rows: { currencies: [eur] } }));

    expect(next.changed).toBe(false);
    expect(next.copy.version).toBe(50);
  });

  it("reports a change when a row differs", () => {
    const first = applied(null, pull({ rows: { currencies: [eur] } })).copy;

    expect(applied(first, pull({ rows: { currencies: [usd] } })).changed).toBe(true);
  });

  it("leaves the copy it was given as it was", () => {
    const first = applied(null, pull({ rows: { currencies: [eur] } })).copy;

    applied(first, pull({ rows: { currencies: [usd] } }));

    expect(rowsOf(first, "currencies")).toEqual([eur]);
  });
});

function applied(copy: LocalCopy | null, changes: Changes) {
  const result = applyPull(copy, changes, schemaVersion);
  if (result.outcome !== "applied") throw new Error("expected the pull to apply");
  return result;
}

function rowsOf(copy: LocalCopy, table: keyof LocalCopy["rows"]) {
  return [...copy.rows[table].values()];
}

type PullOptions = {
  version?: number;
  reset?: boolean;
  spaceIds?: string[];
  rows?: Partial<Changes["rows"]>;
  deleted?: Changes["deleted"];
};

function pull({
  version = 1,
  reset = false,
  spaceIds = ["space-1"],
  rows = {},
  deleted = [],
}: PullOptions = {}): Changes {
  return {
    version,
    reset,
    space_ids: spaceIds,
    deleted,
    rows: {
      currencies: [],
      exchange_rates: [],
      exchange_rate_history_starts: [],
      profiles: [],
      spaces: [],
      space_members: [],
      activity: [],
      ledger_accounts: [],
      transactions: [],
      postings: [],
      recurring_transactions: [],
      budgets: [],
      budget_exclusions: [],
      ...rows,
    },
  };
}

const eur: Currency = { code: "EUR", decimals: 2, rates_by_hand: false, version: 1 };
const usd: Currency = { code: "USD", decimals: 2, rates_by_hand: false, version: 1 };
const eurToday: ExchangeRate = { date: "2026-01-02", currency: "EUR", rate: 1.1, version: 1 };
const eurYesterday: ExchangeRate = { date: "2026-01-01", currency: "EUR", rate: 1.2, version: 1 };
const usdToday: ExchangeRate = { date: "2026-01-01", currency: "USD", rate: 1, version: 1 };
const lunch: Transaction = {
  id: "t1",
  date: "2026-01-02",
  title: "Lunch",
  note: null,
  created_at: "2026-01-02T12:00:00Z",
  created_by: "u1",
  version: 1,
};
const lunchPosting: Posting = {
  id: "p1",
  transaction_id: "t1",
  ledger_account_id: "a1",
  amount: -500,
  currency: "EUR",
  version: 1,
};
