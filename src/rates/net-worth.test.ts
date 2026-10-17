import { describe, expect, it } from "vitest";
import type { LatestRates } from "./convert";
import { netWorth } from "./net-worth";

const currencies = [
  { code: "USD", decimals: 2 },
  { code: "JPY", decimals: 0 },
  { code: "CUP", decimals: 2 },
  { code: "KWD", decimals: 3 },
];
const rates: LatestRates = new Map([
  ["JPY", { currency: "JPY", date: "2026-10-16", rate: 150, stale: false }],
  ["KWD", { currency: "KWD", date: "2026-10-01", rate: 0.3, stale: true }],
]);
const usd = { code: "USD", decimals: 2 };

describe("netWorth", () => {
  it("adds every account in the display currency", () => {
    const result = netWorth(
      [
        { name: "Checking", currency: "USD", balance: 10_000 },
        { name: "Tokyo", currency: "JPY", balance: 15_000 },
      ],
      currencies,
      usd,
      rates,
    );
    expect(result.total).toBe(20_000);
    expect(result.withoutRate).toEqual([]);
    expect(result.staleRates).toEqual([]);
  });

  it("leaves out accounts whose currency has no rate, keeping their own balance", () => {
    const cuba = { name: "Havana", currency: "CUP", balance: 5000 };
    const result = netWorth(
      [{ name: "Checking", currency: "USD", balance: 10_000 }, cuba],
      currencies,
      usd,
      rates,
    );
    expect(result.total).toBe(10_000);
    expect(result.withoutRate).toEqual([cuba]);
  });

  it("reports a stale rate only when a balance was converted with it", () => {
    const stale = [{ name: "Kuwait", currency: "KWD", balance: 3000 }];
    expect(netWorth(stale, currencies, usd, rates).staleRates).toMatchObject([
      { currency: "KWD", date: "2026-10-01" },
    ]);
    expect(
      netWorth([{ name: "Kuwait", currency: "KWD", balance: 0 }], currencies, usd, rates)
        .staleRates,
    ).toEqual([]);
  });
});
