import { describe, expect, it } from "vitest";
import type { Account } from "../accounts/account-queries";
import type { Transaction } from "../transactions/transaction-queries";
import { debtShares } from "./debt-shares";
import type { Counterparty, CounterpartyBalance } from "./read-counterparties";

describe("sharing a debt among accounts", () => {
  it("shares it among the accounts it went out of, newest first", () => {
    const debts = debtShares(
      dad([{ currency: "CUP", owed: 1_000 }]),
      [given("2026-01-10", cash, 500), given("2026-02-10", bank, 500)],
      [cash, bank],
    );

    expect(debts).toEqual([
      {
        currency: "CUP",
        owed: 1_000,
        shares: [
          { accountId: "bank", amount: 500 },
          { accountId: "cash", amount: 500 },
        ],
      },
    ]);
  });

  it("takes money paid back as settling the oldest debt first", () => {
    const debts = debtShares(
      dad([{ currency: "CUP", owed: 600 }]),
      [
        given("2026-01-10", cash, 500),
        given("2026-02-10", bank, 300),
        received("2026-03-10", savings, 200),
      ],
      [cash, bank, savings],
    );

    expect(debts[0]?.shares).toEqual([
      { accountId: "bank", amount: 300 },
      { accountId: "cash", amount: 300 },
    ]);
  });

  it("shares money borrowed among the accounts it reached", () => {
    const debts = debtShares(
      dad([{ currency: "CUP", owed: -700 }]),
      [received("2026-01-10", cash, 700)],
      [cash, bank],
    );

    expect(debts[0]?.shares).toEqual([{ accountId: "cash", amount: 700 }]);
  });

  it("leaves out what's already forgiven, and currencies that are settled", () => {
    const debts = debtShares(
      dad([
        { currency: "CUP", owed: 200 },
        { currency: "USD", owed: 0 },
      ]),
      [given("2026-01-10", cash, 500), forgave("2026-02-10", cash, 300)],
      [cash],
    );

    expect(debts).toEqual([
      { currency: "CUP", owed: 200, shares: [{ accountId: "cash", amount: 200 }] },
    ]);
  });

  it("leaves out money that moved a debt in another currency than its account's", () => {
    const debts = debtShares(
      dad([
        { currency: "CUP", owed: 700 },
        { currency: "USD", owed: 0 },
      ]),
      [
        given("2026-01-10", cash, 500),
        given("2026-02-10", bank, 200),
        given("2026-03-10", { ...savings, currency: "USD" }, 1_000),
        received("2026-04-10", cash, 24_000, { currency: "USD", amount: 1_000 }),
      ],
      [cash, bank],
    );

    expect(debts).toEqual([
      {
        currency: "CUP",
        owed: 700,
        shares: [
          { accountId: "bank", amount: 200 },
          { accountId: "cash", amount: 500 },
        ],
      },
    ]);
  });

  it("moves what went through an archived account onto another", () => {
    const debts = debtShares(
      dad([{ currency: "CUP", owed: 800 }]),
      [given("2026-01-10", { ...savings, archived: true }, 300), given("2026-02-10", cash, 500)],
      [{ ...savings, archived: true }, cash, bank],
    );

    expect(debts[0]?.shares).toEqual([{ accountId: "cash", amount: 800 }]);
  });

  it("shares nothing when the space has no open account left in the currency", () => {
    const debts = debtShares(
      dad([{ currency: "USD", owed: 50 }]),
      [given("2026-01-10", { ...cash, currency: "USD", archived: true }, 50)],
      [cash],
    );

    expect(debts).toEqual([{ currency: "USD", owed: 50, shares: [] }]);
  });
});

function dad(balances: Pick<CounterpartyBalance, "currency" | "owed">[]): Counterparty {
  return {
    id: "dad",
    space_id: "space-1",
    name: "Dad",
    color: "blue",
    created_at: "2026-01-01T00:00:00+00:00",
    balances: balances.map((balance) => ({ ...balance, given: 0, received: 0, forgiven: 0 })),
    has_transactions: true,
  };
}

// The debt is in the account's currency unless said otherwise.
function given(date: string, account: Account, amount: number, debt?: Debt): Transaction {
  return {
    ...transaction(date, "given"),
    ...leaving(account, amount),
    ...owing(debt ?? { currency: account.currency, amount }),
  };
}

function received(date: string, account: Account, amount: number, debt?: Debt): Transaction {
  return {
    ...transaction(date, "received"),
    ...reaching(account, amount),
    ...owing(debt ?? { currency: account.currency, amount }),
  };
}

function forgave(date: string, account: Account, amount: number): Transaction {
  return {
    ...transaction(date, "forgave"),
    ...leaving(account, amount),
    ...reaching(account, amount),
    ...owing({ currency: account.currency, amount }),
  };
}

function leaving(account: Account, amount: number) {
  return { from_account_id: account.id, from_amount: amount, from_currency: account.currency };
}

function owing({ currency, amount }: Debt) {
  return { debt_currency: currency, debt_amount: amount };
}

type Debt = { currency: string; amount: number };

function reaching(account: Account, amount: number) {
  return { to_account_id: account.id, to_amount: amount, to_currency: account.currency };
}

function transaction(date: string, type: Transaction["type"]): Transaction {
  return {
    id: `${type}-${date}`,
    type,
    date,
    title: null,
    note: null,
    created_by: "ana",
    created_at: `${date}T12:00:00+00:00`,
    one_sided: false,
    from_account_id: null,
    from_amount: null,
    from_currency: null,
    to_account_id: null,
    to_amount: null,
    to_currency: null,
    category_id: null,
    counterparty_id: "dad",
    debt_amount: null,
    debt_currency: null,
    space_ids: ["space-1"],
    search_text: "",
  };
}

function account(id: string): Account {
  return {
    id,
    space_id: "space-1",
    name: id,
    currency: "CUP",
    color: "blue",
    archived: false,
    position: 0,
    balance: 0,
    has_transactions: true,
    opening_balance: 0,
    opening_date: null,
    created_at: "2026-01-01T00:00:00+00:00",
  };
}

const cash = account("cash");
const bank = account("bank");
const savings = account("savings");
