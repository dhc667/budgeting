import { describe, expect, it } from "vitest";
import type { LatestRates } from "./convert";
import { quote } from "./quote";

const usd = { code: "USD", decimals: 2 };
const jpy = { code: "JPY", decimals: 0 };
const kwd = { code: "KWD", decimals: 3 };
const cup = { code: "CUP", decimals: 2 };
const rates: LatestRates = new Map([
  ["JPY", { currency: "JPY", date: "2026-10-16", rate: 150.4, stale: false }],
  ["KWD", { currency: "KWD", date: "2026-10-01", rate: 0.3, stale: true }],
]);

describe("quote", () => {
  it("prices one of the stronger currency in the weaker, whichever way it's asked", () => {
    expect(quote(jpy, usd, rates)).toMatchObject({ from: usd, to: jpy, rate: 150.4 });
    expect(quote(usd, jpy, rates)).toMatchObject({ from: usd, to: jpy, rate: 150.4 });
  });

  it("keeps the rate unrounded", () => {
    expect(quote(kwd, usd, rates)?.rate).toBeCloseTo(3.333_333, 6);
    expect(quote(jpy, kwd, rates)?.rate).toBeCloseTo(501.333_333, 6);
  });

  it("dates a stale rate", () => {
    expect(quote(usd, jpy, rates)?.staleSince).toBeNull();
    expect(quote(kwd, usd, rates)?.staleSince).toBe("2026-10-01");
  });

  it("has nothing to say without a rate", () => {
    expect(quote(cup, usd, rates)).toBeNull();
    expect(quote(usd, cup, rates)).toBeNull();
  });
});
