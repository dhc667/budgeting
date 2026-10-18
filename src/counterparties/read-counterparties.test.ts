import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import { readCounterparties } from "./read-counterparties";

type Ledger = RowOf<"ledger_accounts">;
type Posting = RowOf<"postings">;

describe("reading counterparties", () => {
  it("nets what was given to and received from each, per currency", () => {
    const [counterparty] = readCounterparties(
      rows(
        [charlie, cash, pesos],
        [
          ...moved("lunch", cash, charlie, 3_000),
          ...moved("taxi", cash, charlie, 500),
          ...moved("payback", charlie, cash, 1_000),
          ...moved("loan", charlie, pesos, 20_000, "CUP"),
        ],
      ),
    );

    expect(counterparty).toMatchObject({
      name: "Charlie",
      has_transactions: true,
      balances: [
        { currency: "CUP", given: 0, received: 20_000, owed: -20_000 },
        { currency: "USD", given: 3_500, received: 1_000, owed: 2_500 },
      ],
    });
  });

  it("has nothing owed either way before any money moves", () => {
    const [counterparty] = readCounterparties(rows([charlie], []));

    expect(counterparty).toMatchObject({ balances: [], has_transactions: false });
  });

  it("lists only counterparties, by name", () => {
    const acme: Ledger = { ...charlie, id: "acme", name: "Acme" };

    expect(readCounterparties(rows([charlie, cash, acme], [])).map(({ name }) => name)).toEqual([
      "Acme",
      "Charlie",
    ]);
  });
});

const cash: Ledger = {
  id: "cash",
  space_id: "space-1",
  kind: "account",
  name: "Cash",
  currency: "USD",
  color: "blue",
  icon: null,
  parent_id: null,
  position: 0,
  archived: false,
  created_at: "2026-01-01T00:00:00+00:00",
  came_with_space: false,
  version: 1,
};
const pesos: Ledger = { ...cash, id: "pesos", name: "Pesos", currency: "CUP" };
const charlie: Ledger = {
  ...cash,
  id: "charlie",
  kind: "counterparty",
  name: "Charlie",
  currency: null,
};

function rows(ledgers: Ledger[], postings: Posting[]) {
  return { ledger_accounts: byId(ledgers), postings: byId(postings) };
}

// Money moving out of `from` into `to`.
function moved(
  transaction: string,
  from: Ledger,
  to: Ledger,
  amount: number,
  currency = "USD",
): Posting[] {
  return [
    {
      id: `${transaction}-from`,
      transaction_id: transaction,
      ledger_account_id: from.id,
      amount: -amount,
      currency,
      version: 1,
    },
    {
      id: `${transaction}-to`,
      transaction_id: transaction,
      ledger_account_id: to.id,
      amount,
      currency,
      version: 1,
    },
  ];
}

function byId<Row extends { id: string }>(items: Row[]): Map<string, Row> {
  return new Map(items.map((item) => [JSON.stringify([item.id]), item]));
}
