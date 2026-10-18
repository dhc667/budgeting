import { describe, expect, it } from "vitest";
import { readRateHistory } from "./read-rate-history";

describe("rate history", () => {
  const exchange_rates = new Map(
    [
      ["2026-01-01", "EUR", 0.9],
      ["2026-01-05", "EUR", 0.8],
      ["2026-01-09", "EUR", 0.7],
      ["2026-01-05", "CAD", 1.3],
      ["2026-01-05", "GBP", 0.5],
    ].map(([date, currency, rate]) => [
      JSON.stringify([date, currency]),
      { date: String(date), currency: String(currency), rate: Number(rate), version: 1 },
    ]),
  );

  it("starts at the rate in effect on the first day, then everything after", () => {
    const history = readRateHistory({ exchange_rates }, ["EUR"], "2026-01-07");

    expect(history.get("EUR")).toEqual([
      { date: "2026-01-05", rate: 0.8 },
      { date: "2026-01-09", rate: 0.7 },
    ]);
  });

  it("starts at the first rate when none is in effect yet", () => {
    const history = readRateHistory({ exchange_rates }, ["CAD"], "2026-01-01");

    expect(history.get("CAD")).toEqual([{ date: "2026-01-05", rate: 1.3 }]);
  });

  it("holds only the asked currencies, and nothing without spending", () => {
    expect([...readRateHistory({ exchange_rates }, ["EUR", "CAD"], "2026-01-01").keys()]).toEqual([
      "EUR",
      "CAD",
    ]);
    expect(readRateHistory({ exchange_rates }, ["EUR"], undefined).size).toBe(0);
  });
});
