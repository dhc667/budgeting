import { useMemo } from "react";
import { localToday } from "../format/days";
import { useSupabase } from "../instance/instance-context";
import { useCurrencies } from "../money/currency-queries";
import { convertAtDay, type DisplayConversion, type MissingRate } from "../rates/convert-dated";
import { useBackfillMissingRates, useRateHistory } from "../rates/rate-queries";
import type { Space } from "../spaces/space-queries";
import type { AppSupabase } from "../supabase/client";
import type { Repeat } from "../recurring/schedule";
import type { Database } from "../supabase/database";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import {
  type BudgetPlan,
  budgetPeriods,
  currentPeriod,
  type DaySpending,
  type PeriodProgress,
} from "./periods";
import {
  readBudgetExclusions,
  readBudgetHistory,
  readBudgetSpending,
  readBudgets,
  type SpendingRow,
} from "./read-budgets";

export function useBudgets() {
  return useCopyQuery(["budgets"], ({ rows }) => readBudgets(rows));
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
  const dated = useMemo(
    () => (spending ?? []).map((each) => ({ day: each.spent_on, currency: each.currency })),
    [spending],
  );
  const { data: history } = useRateHistory(budget.currency, dated);
  const converted =
    spending && currency && currencies && history
      ? convertSpending(spending, { currencies, currency, history })
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
  return useCopyQuery(["budgets", budget.id, "spending"], ({ rows }) =>
    readBudgetSpending(rows, budget.id),
  );
}

function convertSpending(
  spending: SpendingRow[],
  conversion: DisplayConversion,
): { daily: DaySpending[]; missing: MissingRate[] } {
  const daily: DaySpending[] = [];
  const missing: MissingRate[] = [];
  for (const { spent_on: day, currency, amount } of spending) {
    const converted = convertAtDay(amount, currency, day, conversion);
    switch (converted.kind) {
      case "converted":
        daily.push({ day, amount: converted.minorUnits });
        break;
      case "missing":
        missing.push(converted.missing);
        break;
    }
  }
  return { daily, missing };
}

export function useBudgetHistory(budgetId: string) {
  return useCopyQuery(["budgets", budgetId, "history"], ({ rows }) =>
    readBudgetHistory(rows, budgetId),
  );
}

export function useCreateBudget() {
  const supabase = useSupabase();
  return useCopyMutation(async ({ spaceId, ...details }: BudgetDetails & { spaceId: string }) => {
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
  return useCopyMutation(async (details: BudgetDetails) => {
    const { error } = await supabase
      .from("budgets")
      .update(detailsColumns(details))
      .eq("id", budgetId);
    if (error) throw error;
  });
}

export function useDeleteBudget(budgetId: string) {
  const supabase = useSupabase();
  return useCopyMutation(async () => {
    const { error } = await supabase.from("budgets").delete().eq("id", budgetId);
    if (error) throw error;
  });
}

// Which budgets a transaction is left out of. Only its own spaces' budgets can hold it.
export function useBudgetExclusions(transactionId: string) {
  return useCopyQuery(["budgets", "exclusions", transactionId], ({ rows }) =>
    readBudgetExclusions(rows, transactionId),
  );
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

export type BudgetProgress = {
  // Oldest first, the last holding today unless the budget hasn't started or has ended.
  periods: PeriodProgress[];
  current: PeriodProgress | undefined;
  // Currencies some spending was in that had no rate on its day, left out of what was spent.
  unconverted: string[];
};
