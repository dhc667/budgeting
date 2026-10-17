import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "../instance/instance-context";
import type { AppSupabase } from "../supabase/client";
import { fetchLatestRates, fetchRatesBetween, type ProviderRate } from "./rates-provider";

// Runs on the first open of each day, in the background: a failure only leaves rates as they were.
export function useSyncExchangeRates() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  useQuery({
    queryKey: ["exchange-rates-sync"],
    staleTime: ({ state }) => nextLocalMidnight(state.dataUpdatedAt) - state.dataUpdatedAt,
    retry: false,
    async queryFn() {
      await syncExchangeRates(supabase, await currenciesWithProviderRates(supabase));
      await queryClient.invalidateQueries({ queryKey: ["latest-rates"] });
      return null;
    },
  });
}

function nextLocalMidnight(since: number): number {
  const midnight = new Date(since);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

// Currencies loaded by hand are invisible to the sync: never saved, never measured against.
async function currenciesWithProviderRates(supabase: AppSupabase): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("currencies")
    .select("code")
    .eq("rates_by_hand", false);
  if (error) throw error;
  return new Set(data.map(({ code }) => code));
}

// Each currency's rates stay one unbroken range, so only the stretch after its last stored date
// and the one before its first can be missing. Two requests cover every currency's gaps.
async function syncExchangeRates(supabase: AppSupabase, providerCurrencies: ReadonlySet<string>) {
  const latest = (await fetchLatestRates()).filter(({ currency }) =>
    providerCurrencies.has(currency),
  );
  if (latest.length === 0) return;

  const stored = await storedRanges(supabase);
  await saveRates(
    supabase,
    latest.filter(({ currency }) => !stored.has(currency)),
  );

  const oldestTransaction = await oldestTransactionDate(supabase);
  const coverage = newestDates(latest).map(({ currency, date }) => ({
    currency,
    newest: date,
    stored: stored.get(currency) ?? { from: date, to: date },
  }));

  const forward = coverage.flatMap(({ currency, newest, stored }) =>
    stored.to < newest ? [{ currency, from: addDays(stored.to, 1), to: newest, stored }] : [],
  );
  const ahead = await fetchMissing(forward, (date, stored) => date > stored.to);
  // Saved outward from the stored range, so an interrupted save still leaves it unbroken.
  await saveRates(
    supabase,
    ahead.sort((a, b) => a.date.localeCompare(b.date)),
  );

  const backward = coverage.flatMap(({ currency, stored }) =>
    oldestTransaction && oldestTransaction < stored.from
      ? [{ currency, from: oldestTransaction, to: addDays(stored.from, -1), stored }]
      : [],
  );
  const behind = await fetchMissing(backward, (date, stored) => date < stored.from);
  await saveRates(
    supabase,
    behind.sort((a, b) => b.date.localeCompare(a.date)),
  );
}

async function storedRanges(supabase: AppSupabase): Promise<Map<string, DateRange>> {
  const { data, error } = await supabase.rpc("stored_exchange_rate_ranges");
  if (error) throw error;
  return new Map(
    data.map(({ currency, first_date, last_date }) => [
      currency,
      { from: first_date, to: last_date },
    ]),
  );
}

async function oldestTransactionDate(supabase: AppSupabase): Promise<string | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("date")
    .order("date", { ascending: true })
    .limit(1);
  if (error) throw error;
  return data[0]?.date ?? null;
}

function newestDates(rates: ProviderRate[]): { currency: string; date: string }[] {
  const newest = new Map<string, string>();
  for (const { currency, date } of rates) {
    const seen = newest.get(currency);
    if (!seen || date > seen) newest.set(currency, date);
  }
  return [...newest].map(([currency, date]) => ({ currency, date }));
}

async function fetchMissing(
  gaps: Gap[],
  isMissing: (date: string, stored: DateRange) => boolean,
): Promise<ProviderRate[]> {
  if (gaps.length === 0) return [];
  const from = gaps.map((gap) => gap.from).reduce((a, b) => (a < b ? a : b));
  const to = gaps.map((gap) => gap.to).reduce((a, b) => (a > b ? a : b));
  const storedBy = new Map(gaps.map(({ currency, stored }) => [currency, stored]));
  return (await fetchRatesBetween(from, to)).filter(({ currency, date }) => {
    const stored = storedBy.get(currency);
    return stored !== undefined && isMissing(date, stored);
  });
}

async function saveRates(supabase: AppSupabase, rates: ProviderRate[]) {
  for (let start = 0; start < rates.length; start += batchSize) {
    const { error } = await supabase.rpc("save_exchange_rates", {
      rates: rates.slice(start, start + batchSize),
    });
    if (error) throw error;
  }
}

const batchSize = 5000;

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type DateRange = { from: string; to: string };
type Gap = DateRange & { currency: string; stored: DateRange };
