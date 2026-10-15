import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumber } from "./format";

describe("number formats", () => {
  it.each([
    ["comma_period", "1,234,567.89"],
    ["period_comma", "1.234.567,89"],
    ["space_comma", "1 234 567,89"],
    ["apostrophe_period", "1'234'567.89"],
  ] as const)("writes %s as %s", (format, expected) => {
    expect(formatNumber(1234567.89, format)).toBe(expected);
  });

  it.each([
    ["comma_period", /^R\$1,234\.56$/],
    ["period_comma", /^R\$\s1\.234,56$/],
    ["space_comma", /^1\s234,56\sR\$$/],
    ["apostrophe_period", /^R\$\s1'234\.56$/],
  ] as const)("places the currency symbol by the %s convention", (format, expected) => {
    expect(formatMoney(1234.56, "BRL", format)).toMatch(expected);
  });

  it("uses each currency's own number of decimals", () => {
    expect(formatMoney(1234, "JPY", "comma_period")).toBe("¥1,234");
    expect(formatMoney(1.5, "KWD", "comma_period")).toMatch(/^KWD\s1\.500$/);
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
