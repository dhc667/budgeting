import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import { readLatestRates } from "./read-latest-rates";

describe("reading the latest rates", () => {
  it("has each currency's newest rate", () => {
    const rates = readLatestRates(
      rows([
        rate("EUR", "2026-01-01", 1.1),
        rate("EUR", "2026-01-03", 1.3),
        rate("EUR", "2026-01-02", 1.2),
      ]),
    );

    expect(rates.get("EUR")).toEqual({
      currency: "EUR",
      date: "2026-01-03",
      rate: 1.3,
      stale: false,
    });
  });

  it("calls a rate stale once it is more than a week older than the newest of any currency", () => {
    const rates = readLatestRates(
      rows([
        rate("EUR", "2026-01-10", 1.1),
        rate("GBP", "2026-01-03", 0.8),
        rate("JPY", "2026-01-02", 150),
      ]),
    );

    expect([...rates.values()].map(({ currency, stale }) => [currency, stale])).toEqual([
      ["EUR", false],
      ["GBP", false],
      ["JPY", true],
    ]);
  });

  it("has nothing when there are no rates", () => {
    expect(readLatestRates(rows([])).size).toBe(0);
  });
});

function rate(currency: string, date: string, value: number): RowOf<"exchange_rates"> {
  return { currency, date, rate: value, version: 1 };
}

function rows(rates: RowOf<"exchange_rates">[]) {
  return { exchange_rates: new Map(rates.map((item) => [`${item.currency} ${item.date}`, item])) };
}
