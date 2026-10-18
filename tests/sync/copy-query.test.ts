// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalCopy, Rows } from "../../src/sync/copy";
import { useCopyQuery } from "../../src/sync/copy-query";
import { LocalCopyContext } from "../../src/sync/local-copy-context";

afterEach(cleanup);

describe("a query on the local copy", () => {
  it("is pending while there is no copy", () => {
    renderOn(null);

    expect(screen.getByText("pending")).toBeTruthy();
  });

  it("has a result once there is a copy", () => {
    const { rerender } = renderOn(null);

    rerender(harness(copyWithCurrencies(2)));

    expect(screen.getByText("2 currencies")).toBeTruthy();
  });

  it("has a new result when the copy changes, even at the same version", () => {
    const { rerender } = renderOn(copyWithCurrencies(2));

    rerender(harness(copyWithCurrencies(3)));

    expect(screen.getByText("3 currencies")).toBeTruthy();
  });
});

function renderOn(copy: LocalCopy | null) {
  return render(harness(copy));
}

function harness(copy: LocalCopy | null) {
  return createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(
      LocalCopyContext,
      { value: { copy, requestPull: () => Promise.resolve() } },
      createElement(CurrencyCount),
    ),
  );
}

function CurrencyCount() {
  const { data } = useCopyQuery(["currency-count"], ({ rows }) => rows.currencies.size);
  return createElement("p", null, data === undefined ? "pending" : `${data} currencies`);
}

function copyWithCurrencies(count: number): LocalCopy {
  const currencies = new Map(
    Array.from({ length: count }, (_, index) => {
      const code = `C${index}`;
      return [code, { code, decimals: 2, rates_by_hand: false, version: 1 }];
    }),
  );
  return {
    version: 1,
    spaceIds: [],
    rateCurrencies: [],
    schemaVersion: 1,
    rows: { ...emptyRows, currencies },
  };
}

const emptyRows: Rows = {
  currencies: new Map(),
  exchange_rates: new Map(),
  exchange_rate_history_starts: new Map(),
  profiles: new Map(),
  spaces: new Map(),
  space_members: new Map(),
  activity: new Map(),
  ledger_accounts: new Map(),
  transactions: new Map(),
  postings: new Map(),
  recurring_transactions: new Map(),
  budgets: new Map(),
  budget_exclusions: new Map(),
};
