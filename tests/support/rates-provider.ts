import { today } from "./dates";

export const offlineProvider = {
  fetchLatestRates: () => Promise.reject(new Error("offline")),
  fetchRatesBetween: () => Promise.reject(new Error("offline")),
};

// Every currency in `rates` has its rate on every day `hasRatesOn` allows, like a provider that
// publishes on weekdays only, from the day in `historyStarts`, if any. It answers with nothing
// outside the dates asked for.
export const stubbedProvider = {
  providerId: "stub",
  rates: new Map<string, number>(),
  hasRatesOn: (() => true) as (day: string) => boolean,
  historyStarts: new Map<string, string>(),
  requests: [] as { from: string; to: string; currencies: string[] | undefined }[],
  latestRequests: 0,

  fetchLatestRates() {
    stubbedProvider.latestRequests++;
    return Promise.resolve(stubbedProvider.ratesOn(today()));
  },

  fetchRatesBetween(from: string, to: string, currencies?: string[]) {
    stubbedProvider.requests.push({ from, to, currencies });
    const result = [];
    for (const day of daysBetween(from, to)) result.push(...stubbedProvider.ratesOn(day));
    return Promise.resolve(
      result.filter(({ currency }) => !currencies || currencies.includes(currency)),
    );
  },

  ratesOn(day: string) {
    if (!stubbedProvider.hasRatesOn(day)) return [];
    return [...stubbedProvider.rates]
      .filter(([currency]) => (stubbedProvider.historyStarts.get(currency) ?? day) <= day)
      .map(([currency, rate]) => ({ date: day, currency, rate }));
  },
};

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = new Date(from); day <= new Date(to); day.setUTCDate(day.getUTCDate() + 1))
    days.push(day.toISOString().slice(0, 10));
  return days;
}
