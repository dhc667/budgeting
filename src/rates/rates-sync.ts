import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "../instance/instance-context";
import type { AppSupabase } from "../supabase/client";
import { localToday } from "../format/days";
import {
  fetchLatestRates,
  fetchRatesBetween,
  type ProviderRate,
  providerId,
} from "./rates-provider";

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["latest-rates"] }),
        queryClient.invalidateQueries({ queryKey: ["rate-history"] }),
      ]);
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
// and the one before its first can be missing. One request covers every currency's gaps on each
// side, and each side is saved outward from the stored range, so an interrupted save still leaves
// it unbroken.
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
  const coverage = newestDates(latest).map(({ currency, date }) => ({
    currency,
    newest: date,
    stored: stored.get(currency) ?? { from: date, to: date },
  }));

  await fillForward(supabase, coverage);
  const oldestTransaction = await oldestTransactionDate(supabase);
  if (oldestTransaction) await fillBackward(supabase, coverage, oldestTransaction);
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

async function saveRates(supabase: AppSupabase, rates: ProviderRate[]) {
  for (let start = 0; start < rates.length; start += batchSize) {
    const { error } = await supabase.rpc("save_exchange_rates", {
      rates: rates.slice(start, start + batchSize),
    });
    if (error) throw error;
  }
}

function newestDates(rates: ProviderRate[]): { currency: string; date: string }[] {
  const newest = new Map<string, string>();
  for (const { currency, date } of rates) {
    const seen = newest.get(currency);
    if (!seen || date > seen) newest.set(currency, date);
  }
  return [...newest].map(([currency, date]) => ({ currency, date }));
}

async function fillForward(supabase: AppSupabase, coverage: Coverage[]) {
  const gaps = coverage.flatMap(({ currency, newest, stored }) =>
    stored.to < newest ? [{ currency, from: addDays(stored.to, 1), to: newest, stored }] : [],
  );
  const ahead = await fetchMissing(gaps, (date, stored) => date > stored.to);
  await saveRates(
    supabase,
    ahead.sort((a, b) => a.date.localeCompare(b.date)),
  );
}

async function fetchMissing(
  gaps: Gap[],
  isMissing: (date: string, stored: DateRange) => boolean,
): Promise<ProviderRate[]> {
  if (gaps.length === 0) return [];
  const from = gaps.map((gap) => gap.from).reduce((a, b) => (a < b ? a : b));
  const to = gaps.map((gap) => gap.to).reduce((a, b) => (a > b ? a : b));
  const storedBy = new Map(gaps.map(({ currency, stored }) => [currency, stored]));
  const currencies = gaps.map(({ currency }) => currency);
  return (await fetchRatesBetween(from, to, currencies)).filter(({ currency, date }) => {
    const stored = storedBy.get(currency);
    return stored !== undefined && isMissing(date, stored);
  });
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

// A currency whose history at the provider starts after the oldest transaction would otherwise
// be asked for that stretch on every sync, from every device.
async function fillBackward(
  supabase: AppSupabase,
  coverage: Coverage[],
  oldestTransaction: string,
) {
  const historyStarts = await knownHistoryStarts(supabase);
  const gaps = coverage.flatMap(({ currency, stored }) => {
    const historyStart = historyStarts.get(currency);
    if (oldestTransaction >= stored.from || (historyStart && stored.from <= historyStart)) {
      return [];
    }
    const from = addDays(oldestTransaction, -weekendsAndHolidays);
    return [{ currency, from, to: addDays(stored.from, -1), stored }];
  });
  const behind = await fetchMissing(gaps, (date, stored) => date < stored.from);
  await saveRates(
    supabase,
    behind.sort((a, b) => b.date.localeCompare(a.date)),
  );

  const startsAfterOldest = gaps.flatMap(({ currency, stored }) => {
    const first = behind
      .filter((rate) => rate.currency === currency)
      .reduce((earliest, { date }) => (date < earliest ? date : earliest), stored.from);
    return first > oldestTransaction ? [{ currency, starts_on: first }] : [];
  });
  await recordHistoryStarts(supabase, startsAfterOldest);
}

// Only recent findings count: a provider may add older rates later.
async function knownHistoryStarts(supabase: AppSupabase): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("exchange_rate_history_starts")
    .select("currency, starts_on")
    .eq("provider", providerId)
    .gte("checked_on", addDays(localToday(), -historyRecheckDays));
  if (error) throw error;
  return new Map(data.map(({ currency, starts_on }) => [currency, starts_on]));
}

async function recordHistoryStarts(
  supabase: AppSupabase,
  starts: { currency: string; starts_on: string }[],
) {
  if (starts.length === 0) return;
  const { error } = await supabase.rpc("record_exchange_rate_history_starts", {
    rate_provider: providerId,
    starts,
  });
  if (error) throw error;
}

const batchSize = 5000;

const historyRecheckDays = 30;

// Days without published rates run no longer than this, so asking from this far before the
// oldest transaction reaches the rate it trades at.
const weekendsAndHolidays = 7;

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type DateRange = { from: string; to: string };
type Coverage = { currency: string; newest: string; stored: DateRange };
type Gap = DateRange & { currency: string; stored: DateRange };
