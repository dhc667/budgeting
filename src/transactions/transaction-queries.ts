import { useMemo, useState } from "react";
import { setBudgetExclusions } from "../budgets/budget-queries";
import { createCounterparty } from "../counterparties/counterparty-writes";
import { useSupabase } from "../instance/instance-context";
import { useCurrencies } from "../money/currency-queries";
import { useProfile } from "../profile/profile-queries";
import { useBackfillMissingRates, useRateHistory } from "../rates/rate-queries";
import type { AppSupabase } from "../supabase/client";
import { useSignedInUser } from "../auth/session";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import { dayTotals } from "./day-totals";
import {
  readRecentTransactions,
  readTitleSuggestions,
  readTransaction,
  readTransactionHistory,
  readTransactionPage,
} from "./read-transactions";
import {
  addTransaction,
  deleteTransaction,
  restoreTransaction,
  type TransactionDraft,
  updateTransaction,
} from "./transaction-writes";
import type { Database } from "../supabase/database";

export function useTransactions(filter: TransactionFilter) {
  const filterKey = JSON.stringify(filter);
  const [paging, setPaging] = useState({ filterKey, count: pageSize });
  if (paging.filterKey !== filterKey) setPaging({ filterKey, count: pageSize });
  const count = paging.filterKey === filterKey ? paging.count : pageSize;
  const result = useCopyQuery(["transactions", "list", filter, count], ({ rows }) =>
    readTransactionPage(rows, filter, count),
  );
  return {
    ...result,
    showMore: () => setPaging({ filterKey, count: count + pageSize }),
  };
}

// Undefined until the display currency and the rates of those days have loaded.
export function useDayTotals(days: readonly ListDay[] = noDays) {
  const { data: currencies } = useCurrencies();
  const { data: profile } = useProfile();
  const currency = currencies?.find(({ code }) => code === profile?.display_currency);
  const dated = useMemo(
    () => days.flatMap(({ day, flows }) => flows.map(({ currency }) => ({ currency, day }))),
    [days],
  );
  const { data: history } = useRateHistory(profile?.display_currency ?? "USD", dated);
  const result = useMemo(
    () =>
      currencies && currency && history
        ? { currency, ...dayTotals(days, { currencies, currency, history }) }
        : undefined,
    [days, currencies, currency, history],
  );
  useBackfillMissingRates(result?.missing ?? []);
  return result;
}

// Waits for the spaces to show, rather than first asking for those of no space at all.
export function useRecentTransactions(spaceIds: string[] | undefined, count: number) {
  return useCopyQuery(
    ["transactions", "recent", spaceIds, count],
    ({ rows }) => spaceIds && readRecentTransactions(rows, spaceIds, count),
  );
}

export function useTransaction(transactionId: string) {
  return useCopyQuery(["transactions", transactionId], ({ rows }) =>
    readTransaction(rows, transactionId),
  );
}

export function useTransactionHistory(transactionId: string) {
  return useCopyQuery(["transactions", transactionId, "history"], ({ rows }) =>
    readTransactionHistory(rows, transactionId),
  );
}

export function useTitleSuggestions() {
  const user = useSignedInUser();
  return useCopyQuery(["transactions", "titles"], ({ rows }) =>
    readTitleSuggestions(rows, user.id),
  );
}

// Leaving it out of budgets is a second request: a retry after it failed finds the transaction
// already added, and adds nothing twice.
export function useAddTransaction() {
  const supabase = useSupabase();
  return useCopyMutation(
    async ({
      id,
      excludedBudgetIds,
      newCounterparty,
      ...draft
    }: TransactionDraft & Extras & { id: string }) => {
      if (newCounterparty) await addCounterparty(supabase, newCounterparty);
      await addTransaction(supabase, id, draft);
      if (excludedBudgetIds.length > 0) await setBudgetExclusions(supabase, id, excludedBudgetIds);
    },
  );
}

export function useUpdateTransaction(transactionId: string) {
  const supabase = useSupabase();
  return useCopyMutation(
    async ({ excludedBudgetIds, newCounterparty, ...draft }: TransactionDraft & Extras) => {
      if (newCounterparty) await addCounterparty(supabase, newCounterparty);
      await updateTransaction(supabase, transactionId, draft);
      await setBudgetExclusions(supabase, transactionId, excludedBudgetIds);
    },
  );
}

function addCounterparty(supabase: AppSupabase, { id, spaceId, name }: NewCounterparty) {
  return createCounterparty(supabase, spaceId, { name, color: "slate" }, id);
}

export function useDeleteTransaction(transactionId: string) {
  const supabase = useSupabase();
  return useCopyMutation(() => deleteTransaction(supabase, transactionId));
}

export function useRestoreTransaction(transactionId: string) {
  const supabase = useSupabase();
  return useCopyMutation(() => restoreTransaction(supabase, transactionId));
}

const pageSize = 50;
const noDays: ListDay[] = [];

// What saving a transaction does besides: the budgets it's left out of, and the counterparty it
// creates, named in the form.
export type Extras = { excludedBudgetIds: string[]; newCounterparty: NewCounterparty | null };

export type NewCounterparty = { id: string; spaceId: string; name: string };

export type Transaction = Database["public"]["Views"]["transaction_details"]["Row"];

// Each part narrows the list further; dates are inclusive.
export type TransactionFilter = {
  spaceIds?: string[];
  accountIds?: string[];
  categoryIds?: string[];
  counterpartyIds?: string[];
  from?: string;
  to?: string;
  search?: string;
};

export type TransactionPage = { transactions: Transaction[]; hasMore: boolean; days: ListDay[] };

// A day of the list, over every transaction on it that matches, shown or not.
export type ListDay = { day: string; count: number; flows: DayFlow[] };

// What the day earned less what it spent, in one currency.
export type DayFlow = { currency: string; net: number };

export type TitleSuggestion =
  Database["public"]["Functions"]["title_suggestions"]["Returns"][number];
