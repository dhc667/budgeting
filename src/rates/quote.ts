import type { Currency } from "../format/format";
import { exchangeRate, type LatestRate, type LatestRates } from "./convert";

// From the stronger currency, so it reads $1 = CUP 410 rather than CUP 1 = $0.0024.
export function quote(a: Currency, b: Currency, rates: LatestRates): Quote | null {
  const rate = exchangeRate(a.code, b.code, rates);
  switch (rate.kind) {
    case "no-rate":
      return null;
    case "rate":
      return rate.rate >= 1
        ? { from: a, to: b, rate: rate.rate, staleSince: oldest(rate.staleRates) }
        : { from: b, to: a, rate: 1 / rate.rate, staleSince: oldest(rate.staleRates) };
  }
}

function oldest(rates: readonly LatestRate[]): string | null {
  return rates.map(({ date }) => date).sort()[0] ?? null;
}

// One whole `from` buys `rate` of `to`.
export type Quote = { from: Currency; to: Currency; rate: number; staleSince: string | null };
