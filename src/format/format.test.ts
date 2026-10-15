import { describe, expect, it } from "vitest";
import { formatAmount, formatDate, formatMoney } from "./format";

const brl = { code: "BRL", decimals: 2 };
const usd = { code: "USD", decimals: 2 };

describe("number formats", () => {
  it.each([
    ["comma_period", "1,234,567.89"],
    ["period_comma", "1.234.567,89"],
    ["space_comma", "1\u202F234\u202F567,89"],
    ["apostrophe_period", "1'234'567.89"],
  ] as const)("writes %s as %s", (format, expected) => {
    expect(formatAmount(123456789, 2, format)).toBe(expected);
  });

  it.each([
    ["comma_period", "R$1,234.56"],
    ["period_comma", "R$\u00A01.234,56"],
    ["space_comma", "1\u202F234,56\u00A0R$"],
    ["apostrophe_period", "R$\u00A01'234.56"],
  ] as const)("places the currency symbol by the %s convention", (format, expected) => {
    expect(formatMoney(123456, brl, format, "en")).toBe(expected);
  });

  it("takes the currency symbol from the language, whatever the format", () => {
    expect(formatMoney(123456, usd, "comma_period", "pt-BR")).toBe("US$1,234.56");
    expect(formatMoney(123456, { code: "EUR", decimals: 2 }, "apostrophe_period", "en")).toBe(
      "€\u00A01'234.56",
    );
  });

  it("separates a symbol made of letters from the amount", () => {
    expect(formatMoney(1500, { code: "KWD", decimals: 3 }, "comma_period", "en")).toBe(
      "KWD\u00A01.500",
    );
  });

  it("uses each currency's own number of decimals", () => {
    expect(formatMoney(1234, { code: "JPY", decimals: 0 }, "comma_period", "en")).toBe("¥1,234");
    expect(formatMoney(5, usd, "comma_period", "en")).toBe("$0.05");
  });

  it("puts the minus sign first", () => {
    expect(formatMoney(-123456, brl, "period_comma", "en")).toBe("-R$\u00A01.234,56");
    expect(formatMoney(-123456, brl, "space_comma", "en")).toBe("-1\u202F234,56\u00A0R$");
  });

  it("writes the largest amounts exactly, in every format", () => {
    expect(formatAmount(Number.MAX_SAFE_INTEGER, 2, "comma_period")).toBe("90,071,992,547,409.91");
    expect(formatAmount(Number.MAX_SAFE_INTEGER, 2, null).replace(/\D/g, "")).toBe(
      "9007199254740991",
    );
  });

  it("refuses an amount that isn't a whole number of minor units", () => {
    expect(() => formatMoney(12.5, usd, "comma_period", "en")).toThrow();
  });
});

describe("date formats", () => {
  const fourthOfOctober = new Date(2026, 9, 4);

  it.each([
    ["day_month_year", "04/10/2026"],
    ["month_day_year", "10/04/2026"],
    ["year_month_day", "2026-10-04"],
  ] as const)("writes %s as %s", (format, expected) => {
    expect(formatDate(fourthOfOctober, format)).toBe(expected);
  });
});
