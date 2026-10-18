import { daysAfter } from "../format/days";
import type { Rows } from "../sync/copy";
import type { LatestRates } from "./convert";

// Stale: more than a week older than the newest rate of any currency, not than today, so a week
// without anyone opening the app doesn't make every rate stale.
export function readLatestRates({ exchange_rates }: Pick<Rows, "exchange_rates">): LatestRates {
  const latest = new Map<string, { date: string; rate: number }>();
  for (const { currency, date, rate } of exchange_rates.values()) {
    const seen = latest.get(currency);
    if (!seen || date > seen.date) latest.set(currency, { date, rate });
  }

  const newest = [...latest.values()].reduce<string | undefined>(
    (newest, { date }) => (newest === undefined || date > newest ? date : newest),
    undefined,
  );
  const staleBefore = newest === undefined ? undefined : daysAfter(newest, -staleAfterDays);
  return new Map(
    [...latest].map(([currency, { date, rate }]) => [
      currency,
      { currency, date, rate, stale: staleBefore !== undefined && date < staleBefore },
    ]),
  );
}

const staleAfterDays = 7;
