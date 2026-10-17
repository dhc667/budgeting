import { today } from "./dates";

export const offlineProvider = {
  fetchLatestRates: () => Promise.reject(new Error("offline")),
  fetchRatesBetween: () => Promise.reject(new Error("offline")),
};

// Every currency in `rates` has its rate on every day `hasRatesOn` allows, like a provider that
// publishes on weekdays only. Asked from a day with none, it also answers with the one before.
export const stubbedProvider = {
  rates: new Map<string, number>(),
  hasRatesOn: (() => true) as (day: string) => boolean,

  fetchLatestRates() {
    return Promise.resolve(stubbedProvider.ratesOn(today()));
  },

  fetchRatesBetween(from: string, to: string) {
    const result = [];
    for (const day of daysBetween(from, to)) result.push(...stubbedProvider.ratesOn(day));
    if (!stubbedProvider.hasRatesOn(from)) {
      const last = lastDayWithRates(from);
      if (last) result.unshift(...stubbedProvider.ratesOn(last));
    }
    return Promise.resolve(result);
  },

  ratesOn(day: string) {
    if (!stubbedProvider.hasRatesOn(day)) return [];
    return [...stubbedProvider.rates].map(([currency, rate]) => ({ date: day, currency, rate }));
  },
};

function lastDayWithRates(before: string): string | undefined {
  for (let n = 1; n <= 14; n++) {
    const day = dayBefore(before, n);
    if (stubbedProvider.hasRatesOn(day)) return day;
  }
  return undefined;
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = new Date(from); day <= new Date(to); day.setUTCDate(day.getUTCDate() + 1))
    days.push(day.toISOString().slice(0, 10));
  return days;
}

function dayBefore(day: string, days: number): string {
  const date = new Date(day);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
