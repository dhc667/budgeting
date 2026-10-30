import type { Currency } from "../format/format";

// USD is the base: it has no stored rate and always counts as 1.
export function convert(
  minorUnits: number,
  from: Currency,
  to: Currency,
  rates: LatestRates,
): Conversion {
  if (from.code === to.code) return { kind: "converted", minorUnits, staleRates: [] };

  const pair = ratesOf(from.code, to.code, rates);
  switch (pair.kind) {
    case "no-rate":
      return pair;
    case "rates": {
      const { fromRate, toRate, staleRates } = pair;
      const exact = rescale(minorUnits * toRate.rate, to.decimals - from.decimals) / fromRate.rate;
      return { kind: "converted", minorUnits: roundHalfAwayFromZero(exact), staleRates };
    }
  }
}

// How many of `to` one whole `from` buys, unrounded.
export function exchangeRate(from: string, to: string, rates: LatestRates): ExchangeRate {
  const pair = ratesOf(from, to, rates);
  switch (pair.kind) {
    case "no-rate":
      return pair;
    case "rates": {
      const { fromRate, toRate, staleRates } = pair;
      return { kind: "rate", rate: toRate.rate / fromRate.rate, staleRates };
    }
  }
}

// At the rates in effect on `day`, the latest on or before it, as budgets and reports convert.
export function convertOn(
  minorUnits: number,
  from: Currency,
  to: Currency,
  day: string,
  history: RateHistory,
): Conversion {
  const ratesOn = new Map(
    [from.code, to.code].flatMap((code) => {
      const rate = latestOnOrBefore(history.get(code) ?? [], day);
      return rate ? [[code, { currency: code, ...rate, stale: false }] as const] : [];
    }),
  );
  return convert(minorUnits, from, to, ratesOn);
}

function latestOnOrBefore(rates: readonly DatedRate[], day: string): DatedRate | undefined {
  let low = 0;
  let high = rates.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((rates[middle]?.date ?? "") <= day) low = middle + 1;
    else high = middle;
  }
  return rates[low - 1];
}

function ratesOf(from: string, to: string, rates: LatestRates): RatePair {
  const fromRate = rateOf(from, rates);
  const toRate = rateOf(to, rates);
  if (!fromRate) return { kind: "no-rate", currency: from };
  if (!toRate) return { kind: "no-rate", currency: to };
  const staleRates = [fromRate, toRate].filter((rate) => rate.stale && rate.currency !== "USD");
  return { kind: "rates", fromRate, toRate, staleRates };
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

// Each currency's rates, oldest first.
export type RateHistory = ReadonlyMap<string, readonly DatedRate[]>;

type DatedRate = { date: string; rate: number };

export type Conversion =
  | { kind: "converted"; minorUnits: number; staleRates: LatestRate[] }
  | { kind: "no-rate"; currency: string };

export type ExchangeRate =
  { kind: "rate"; rate: number; staleRates: LatestRate[] } | { kind: "no-rate"; currency: string };

type RatePair =
  | { kind: "rates"; fromRate: LatestRate; toRate: LatestRate; staleRates: LatestRate[] }
  | { kind: "no-rate"; currency: string };
