import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import { readCurrencies } from "./read-currencies";

describe("reading currencies", () => {
  it("has each currency's code and decimals, ordered by code", () => {
    const currencies = readCurrencies({
      currencies: new Map([
        ["USD", currency("USD", 2)],
        ["JPY", currency("JPY", 0)],
        ["EUR", currency("EUR", 2)],
      ]),
    });

    expect(currencies).toEqual([
      { code: "EUR", decimals: 2 },
      { code: "JPY", decimals: 0 },
      { code: "USD", decimals: 2 },
    ]);
  });
});

function currency(code: string, decimals: number): RowOf<"currencies"> {
  return { code, decimals, rates_by_hand: false, version: 1 };
}
