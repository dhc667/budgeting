import { describe, expect, it } from "vitest";
import { formatAmount, wholeUnits } from "./money.ts";

describe("an amount printed for a person", () => {
  it("has as many decimals as its currency, and its sign in front", () => {
    expect(formatAmount(123450, "USD", 2)).toBe("1234.50 USD");
    expect(formatAmount(-5, "USD", 2)).toBe("-0.05 USD");
    expect(formatAmount(1250, "JPY", 0)).toBe("1250 JPY");
    expect(formatAmount(-1, "BHD", 3)).toBe("-0.001 BHD");
  });
});

describe("an amount in JSON", () => {
  it("is in whole units of its currency", () => {
    expect(wholeUnits(123450, 2)).toBe(1234.5);
    expect(wholeUnits(-2500, 0)).toBe(-2500);
  });
});
