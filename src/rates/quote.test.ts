import { describe, expect, it } from "vitest";
import type { LatestRates } from "./convert";
import { quote } from "./quote";

const usd = { code: "USD", decimals: 2 };
const jpy = { code: "JPY", decimals: 0 };
const kwd = { code: "KWD", decimals: 3 };
const cup = { code: "CUP", decimals: 2 };
const rates: LatestRates = new Map([
  ["JPY", { currency: "JPY", date: "2026-10-16", rate: 150, stale: false }],
  ["KWD", { currency: "KWD", date: "2026-10-16", rate: 0.3, stale: false }],
]);

describe("quote", () => {
  it("prices one of the stronger currency in the weaker, whichever way it's asked", () => {
    expect(quote(jpy, usd, rates)).toEqual({ one: usd, is: 150, in: jpy });
    expect(quote(usd, jpy, rates)).toEqual({ one: usd, is: 150, in: jpy });
    expect(quote(kwd, usd, rates)).toEqual({ one: kwd, is: 333, in: usd });
  });

  it("goes through the dollar between two other currencies", () => {
    expect(quote(jpy, kwd, rates)).toEqual({ one: kwd, is: 500, in: jpy });
  });

  it("has nothing to say without a rate", () => {
    expect(quote(cup, usd, rates)).toBeNull();
    expect(quote(usd, cup, rates)).toBeNull();
  });
});
