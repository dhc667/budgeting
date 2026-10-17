import type { Currency } from "../format/format";

// USD is the base: it has no stored rate and always counts as 1.
export function convert(
  minorUnits: number,
  from: Currency,
  to: Currency,
  rates: LatestRates,
): Conversion {
  if (from.code === to.code) return { kind: "converted", minorUnits, staleRates: [] };

  const fromRate = rateOf(from.code, rates);
  const toRate = rateOf(to.code, rates);
  if (!fromRate) return { kind: "no-rate", currency: from.code };
  if (!toRate) return { kind: "no-rate", currency: to.code };

  const exact = rescale(minorUnits * toRate.rate, to.decimals - from.decimals) / fromRate.rate;
  return {
    kind: "converted",
    minorUnits: roundHalfAwayFromZero(exact),
    staleRates: [fromRate, toRate].filter((rate) => rate.stale && rate.currency !== "USD"),
  };
}

function rateOf(code: string, rates: LatestRates): LatestRate | undefined {
  return code === "USD" ? usd : rates.get(code);
}

const usd: LatestRate = { currency: "USD", date: "", rate: 1, stale: false };

function rescale(value: number, decimalsGained: number): number {
  return decimalsGained >= 0 ? value * 10 ** decimalsGained : value / 10 ** -decimalsGained;
}

function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export type LatestRate = { currency: string; date: string; rate: number; stale: boolean };

export type LatestRates = ReadonlyMap<string, LatestRate>;

export type Conversion =
  | { kind: "converted"; minorUnits: number; staleRates: LatestRate[] }
  | { kind: "no-rate"; currency: string };
