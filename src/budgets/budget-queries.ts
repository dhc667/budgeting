import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { localToday } from "../format/days";
import type { Currency } from "../format/format";
import { useSupabase } from "../instance/instance-context";
import { useCurrencies } from "../money/currency-queries";
import { convertOn, type RateHistory } from "../rates/convert";
import type { Activity, Space } from "../spaces/space-queries";
import type { AppSupabase } from "../supabase/client";
import type { Repeat } from "../recurring/schedule";
import type { Database } from "../supabase/database";
import {
  type BudgetPlan,
  budgetPeriods,
  currentPeriod,
  type DaySpending,
  type PeriodProgress,
} from "./periods";

export function useBudgets() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["budgets"],
    async queryFn(): Promise<Budget[]> {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .order("name")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function shownBudgets(
  budgets: Budget[] | undefined,
  shownSpaces: Space[] | undefined,
): Budget[] | undefined {
  if (!budgets || !shownSpaces) return undefined;
  return budgets.filter(({ space_id }) => shownSpaces.some(({ id }) => id === space_id));
}

// Undefined until everything it needs has loaded.
export function useBudgetProgress(budget: Budget): BudgetProgress | undefined {
  const { data: spending } = useBudgetSpending(budget);
  const { data: currencies } = useCurrencies();
  const currency = currencies?.find(({ code }) => code === budget.currency);
  const { data: history } = useRateHistory(spending ?? [], budget.currency);
  const converted =
    spending && currency && currencies && history
      ? convertSpending(spending, currency, currencies, history)
      : undefined;
  useBackfillMissingRates(converted?.missing ?? []);
  if (!converted) return undefined;

  const today = localToday();
  const periods = budgetPeriods(planOf(budget), converted.daily, today);
  return {
    periods,
    current: currentPeriod(periods, today),
    unconverted: [...new Set(converted.missing.map(({ currency }) => currency))],
  };
}

function useBudgetSpending(budget: Budget) {
  const supabase = useSupabase();
  return useQuery({
    // The whole budget, so that an edit to what it covers reads it again.
    queryKey: ["budgets", "spending", budget],
    queryFn: () =>
      allRows<SpendingRow>((from, to) =>
        supabase.rpc("budget_spending", { budget_id: budget.id }).range(from, to),
      ),
  });
}

// Each currency's rates from the one in effect on its first day of spending on, as a day's rate is
// the latest on or before it.
function useRateHistory(spending: SpendingRow[], budgetCurrency: string) {
  const supabase = useSupabase();
  const codes = [...new Set([budgetCurrency, ...spending.map(({ currency }) => currency)])]
    .filter((code) => code !== "USD")
    .sort();
  const firstDay = spending[0]?.spent_on;
  return useQuery({
    queryKey: ["rate-history", codes, firstDay],
    async queryFn(): Promise<RateHistory> {
      if (firstDay === undefined) return new Map();
      const histories = await Promise.all(
        codes.map(async (code) => [code, await ratesSince(supabase, code, firstDay)] as const),
      );
      return new Map(histories);
    },
  });
}

async function ratesSince(supabase: AppSupabase, currency: string, day: string) {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("date")
    .eq("currency", currency)
    .lte("date", day)
    .order("date", { ascending: false })
    .limit(1);
  if (error) throw error;
  const from = data[0]?.date ?? day;
  return allRows<{ date: string; rate: number }>((start, end) =>
    supabase
      .from("exchange_rates")
      .select("date, rate")
      .eq("currency", currency)
      .gte("date", from)
      .order("date")
      .range(start, end),
  );
}

// Each response holds at most a page; asks for the next until one comes back short.
async function allRows<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: Error | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

const pageSize = 1000;

function convertSpending(
  spending: SpendingRow[],
  to: Currency,
  currencies: Currency[],
  history: RateHistory,
): { daily: DaySpending[]; missing: { currency: string; day: string }[] } {
  const daily: DaySpending[] = [];
  const missing: { currency: string; day: string }[] = [];
  for (const { spent_on: day, currency: code, amount } of spending) {
    const from = currencies.find((candidate) => candidate.code === code);
    const converted = from ? convertOn(amount, from, to, day, history) : undefined;
    switch (converted?.kind) {
      case "converted":
        daily.push({ day, amount: converted.minorUnits });
        break;
      case "no-rate":
        missing.push({ currency: converted.currency, day });
        break;
      case undefined:
        missing.push({ currency: code, day });
        break;
    }
  }
  return { daily, missing };
}

// The daily sync fetches rates back to the oldest transaction, but only once a day: one dated
// before every other, recorded since, waits until tomorrow unless asked now. Asked once per day and
// currency, as a provider without that history would otherwise be asked on every render.
function useBackfillMissingRates(missing: { currency: string; day: string }[]) {
  const queryClient = useQueryClient();
  const asked = missing
    .map(({ currency, day }) => `${currency} ${day}`)
    .filter((key) => !askedFor(queryClient).has(key));
  const key = asked.join(",");
  useEffect(() => {
    if (key === "") return;
    for (const each of key.split(",")) askedFor(queryClient).add(each);
    void queryClient.invalidateQueries(
      { queryKey: ["exchange-rates-sync"] },
      { cancelRefetch: false },
    );
  }, [key, queryClient]);
}

function askedFor(queryClient: QueryClient): Set<string> {
  let asked = askedByClient.get(queryClient);
  if (!asked) {
    asked = new Set();
    askedByClient.set(queryClient, asked);
  }
  return asked;
}

const askedByClient = new WeakMap<QueryClient, Set<string>>();

export function useBudgetHistory(budgetId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["budgets", budgetId, "history"],
    async queryFn(): Promise<Activity[]> {
      const { data, error } = await supabase.rpc("budget_history", { budget_id: budgetId });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateBudget() {
  const supabase = useSupabase();
  return useBudgetMutation(async ({ spaceId, ...details }: BudgetDetails & { spaceId: string }) => {
    const { data, error } = await supabase
      .from("budgets")
      .insert({ space_id: spaceId, ...detailsColumns(details) })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  });
}

export function useUpdateBudget(budgetId: string) {
  const supabase = useSupabase();
  return useBudgetMutation(async (details: BudgetDetails) => {
    const { error } = await supabase
      .from("budgets")
      .update(detailsColumns(details))
      .eq("id", budgetId);
    if (error) throw error;
  });
}

export function useDeleteBudget(budgetId: string) {
  const supabase = useSupabase();
  return useBudgetMutation(async () => {
    const { error } = await supabase.from("budgets").delete().eq("id", budgetId);
    if (error) throw error;
  });
}

// Which budgets a transaction is left out of. Only its own spaces' budgets can hold it.
export function useBudgetExclusions(transactionId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["budgets", "exclusions", transactionId],
    async queryFn(): Promise<string[]> {
      const { data, error } = await supabase
        .from("budget_exclusions")
        .select("budget_id")
        .eq("transaction_id", transactionId);
      if (error) throw error;
      return data.map(({ budget_id }) => budget_id);
    },
  });
}

export async function setBudgetExclusions(
  supabase: AppSupabase,
  transactionId: string,
  budgetIds: string[],
) {
  const { error } = await supabase.rpc("set_budget_exclusions", {
    transaction_id: transactionId,
    budget_ids: budgetIds,
  });
  if (error) throw error;
}

// Budget changes show up in their space's activity too.
function useBudgetMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["budgets"] }),
        queryClient.invalidateQueries({ queryKey: ["spaces"] }),
      ]),
  });
}

function detailsColumns(details: BudgetDetails) {
  const repeat = details.length.kind === "repeating" ? details.length : null;
  return {
    name: details.name,
    currency: details.currency,
    amount: details.limit,
    starts_on: details.startsOn,
    ends_on: details.length.kind === "fixed" ? details.length.endsOn : null,
    every: repeat?.every ?? null,
    unit: repeat?.unit ?? null,
    carry_unspent: repeat !== null && details.carryUnspent,
    carry_overspent: repeat !== null && details.carryOverspent,
    category_ids: details.categoryIds,
    account_ids: details.accountIds,
  };
}

export function detailsOf(budget: Budget): BudgetDetails {
  return {
    ...planOf(budget),
    name: budget.name,
    currency: budget.currency,
    categoryIds: budget.category_ids,
    accountIds: budget.account_ids,
  };
}

function planOf(budget: Budget): BudgetPlan {
  const repeat = repeatOf(budget);
  return {
    limit: budget.amount,
    startsOn: budget.starts_on,
    length: repeat
      ? { kind: "repeating", ...repeat }
      : { kind: "fixed", endsOn: budget.ends_on ?? budget.starts_on },
    carryUnspent: budget.carry_unspent,
    carryOverspent: budget.carry_overspent,
  };
}

// Null for a budget that runs between two dates.
export function repeatOf({ every, unit }: Budget): Repeat | null {
  return every !== null && unit !== null ? { every, unit } : null;
}

export type Budget = Database["public"]["Tables"]["budgets"]["Row"];

// Null for categories or accounts means every one in the space, including those added later.
export type BudgetDetails = BudgetPlan & {
  name: string;
  currency: string;
  categoryIds: string[] | null;
  accountIds: string[] | null;
};

type SpendingRow = Database["public"]["Functions"]["budget_spending"]["Returns"][number];

export type BudgetProgress = {
  // Oldest first, the last holding today unless the budget hasn't started or has ended.
  periods: PeriodProgress[];
  current: PeriodProgress | undefined;
  // Currencies some spending was in that had no rate on its day, left out of what was spent.
  unconverted: string[];
};
