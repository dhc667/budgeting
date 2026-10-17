import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "../instance/instance-context";
import type { AppSupabase } from "../supabase/client";
import { fetchLatestRates, fetchRatesBetween, type ProviderRate } from "./rates-provider";

// Runs once per session, in the background: a failure only leaves rates as they were.
export function useSyncExchangeRates() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  useQuery({
    queryKey: ["exchange-rates-sync"],
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: false,
    async queryFn() {
      await syncExchangeRates(supabase, await currenciesWithProviderRates(supabase));
      await queryClient.invalidateQueries({ queryKey: ["latest-rates"] });
      return null;
    },
  });
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

async function syncExchangeRates(supabase: AppSupabase, known: ReadonlySet<string>) {
  const latest = (await fetchLatestRates()).filter(({ currency }) => known.has(currency));
  const newest = latest
    .map(({ date }) => date)
    .sort()
    .at(-1);
  if (!newest) return;

  const covered = [...new Set(latest.map(({ currency }) => currency))];
  const stored = await storedRange(supabase, covered);
  if (!stored) await saveRates(supabase, latest);

  const gaps = missingRanges(stored, newest, await oldestTransactionDate(supabase));
  for (const gap of gaps) {
    const rates = await fetchRatesBetween(gap.from, gap.to);
    await saveRates(
      supabase,
      rates.filter(({ currency }) => known.has(currency)),
    );
  }
}

// Each currency's rates stay one unbroken range, so only the stretch after the last stored date
// and the one before the first can be missing.
export function missingRanges(
  stored: DateRange | null,
  newest: string,
  oldestTransaction: string | null,
): DateRange[] {
  const first = stored?.from ?? newest;
  const last = stored?.to ?? newest;
  const gaps: DateRange[] = [];
  if (last < newest) gaps.push({ from: addDays(last, 1), to: newest });
  if (oldestTransaction && oldestTransaction < first)
    gaps.push({ from: oldestTransaction, to: addDays(first, -1) });
  return gaps;
}

async function storedRange(supabase: AppSupabase, currencies: string[]): Promise<DateRange | null> {
  const [from, to] = await Promise.all(
    [true, false].map(async (ascending) => {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("date")
        .in("currency", currencies)
        .order("date", { ascending })
        .limit(1);
      if (error) throw error;
      return data[0]?.date;
    }),
  );
  return from && to ? { from, to } : null;
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

async function saveRates(supabase: AppSupabase, rates: ProviderRate[]) {
  for (let start = 0; start < rates.length; start += batchSize) {
    const batch = rates.slice(start, start + batchSize);
    const { error } = await supabase.rpc("save_exchange_rates", {
      rate_dates: batch.map(({ date }) => date),
      rate_currencies: batch.map(({ currency }) => currency),
      rate_values: batch.map(({ rate }) => rate),
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

export type DateRange = { from: string; to: string };
