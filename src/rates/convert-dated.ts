import type { Currency } from "../format/format";
import { convertOn, type RateHistory } from "./convert";

// Converts an amount at the rate of its own day, or names the currency and day that had no rate.
export function convertAtDay(
  minorUnits: number,
  code: string,
  day: string,
  { currencies, currency: to, history }: DisplayConversion,
): DatedConversion {
  const from = currencies.find((candidate) => candidate.code === code);
  const converted = from ? convertOn(minorUnits, from, to, day, history) : undefined;
  switch (converted?.kind) {
    case "converted":
      return { kind: "converted", minorUnits: converted.minorUnits };
    case "no-rate":
      return { kind: "missing", missing: { currency: converted.currency, day } };
    case undefined:
      return { kind: "missing", missing: { currency: code, day } };
  }
}

// Each currency once, at the earliest day any of the lists lacked a rate on, which is where
// backfilling has to reach.
export function earliestMissing(...lists: readonly (readonly MissingRate[])[]): MissingRate[] {
  const firstDays = new Map<string, string>();
  for (const { currency, day } of lists.flat()) {
    const known = firstDays.get(currency);
    if (known === undefined || day < known) firstDays.set(currency, day);
  }
  return [...firstDays]
    .map(([currency, day]) => ({ currency, day }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export type DisplayConversion = {
  currencies: readonly Currency[];
  currency: Currency;
  history: RateHistory;
};

export type MissingRate = { currency: string; day: string };

export type DatedConversion =
  { kind: "converted"; minorUnits: number } | { kind: "missing"; missing: MissingRate };
