import { describe, expect, it } from "vitest";
import { convert, type LatestRates } from "./convert";

const usd = { code: "USD", decimals: 2 };
const jpy = { code: "JPY", decimals: 0 };
const eur = { code: "EUR", decimals: 2 };
const kwd = { code: "KWD", decimals: 3 };

const rates: LatestRates = new Map([
  ["JPY", { currency: "JPY", date: "2026-10-16", rate: 150, stale: false }],
  ["EUR", { currency: "EUR", date: "2026-10-16", rate: 0.9, stale: false }],
  ["KWD", { currency: "KWD", date: "2026-10-01", rate: 0.3, stale: true }],
]);

describe("convert", () => {
  it("turns US cents into whole yen", () => {
    expect(convert(1000, usd, jpy, rates)).toEqual({
      kind: "converted",
      minorUnits: 1500,
      staleRates: [],
    });
  });

  it("turns whole yen into US cents", () => {
    expect(convert(1500, jpy, usd, rates)).toMatchObject({ kind: "converted", minorUnits: 1000 });
  });

  it("goes through USD between two other currencies, rounding once", () => {
    // 100.00 EUR = 111.111… USD = 16666.67 JPY
    expect(convert(10_000, eur, jpy, rates)).toMatchObject({ minorUnits: 16_667 });
    // 1 JPY = 0.00666… USD = 0.006 EUR → 0.60 cents, so 1 cent
    expect(convert(1, jpy, eur, rates)).toMatchObject({ minorUnits: 1 });
  });

  it("handles currencies with three decimals", () => {
    expect(convert(1000, usd, kwd, rates)).toMatchObject({ minorUnits: 3000 });
  });

  it("rounds halves away from zero", () => {
    expect(convert(1, jpy, usd, new Map([["JPY", rate("JPY", 200)]]))).toMatchObject({
      minorUnits: 1,
    });
    expect(convert(-1, jpy, usd, new Map([["JPY", rate("JPY", 200)]]))).toMatchObject({
      minorUnits: -1,
    });
  });

  it("returns the amount unchanged for the same currency, rates or not", () => {
    expect(convert(12_345, usd, usd, new Map())).toEqual({
      kind: "converted",
      minorUnits: 12_345,
      staleRates: [],
    });
    expect(convert(12_345, eur, eur, new Map())).toMatchObject({ minorUnits: 12_345 });
  });

  it("reports a currency without a rate, on either side", () => {
    expect(convert(1000, { code: "CUP", decimals: 2 }, usd, rates)).toEqual({
      kind: "no-rate",
      currency: "CUP",
    });
    expect(convert(1000, usd, { code: "CUP", decimals: 2 }, rates)).toEqual({
      kind: "no-rate",
      currency: "CUP",
    });
  });

  it("reports the stale rates a conversion used", () => {
    expect(convert(1000, kwd, eur, rates)).toMatchObject({
      kind: "converted",
      staleRates: [{ currency: "KWD", date: "2026-10-01" }],
    });
    expect(convert(1000, usd, eur, rates)).toMatchObject({ staleRates: [] });
  });
});

function rate(currency: string, value: number) {
  return { currency, date: "2026-10-16", rate: value, stale: false };
}
