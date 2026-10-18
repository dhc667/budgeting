import { useState } from "react";
import { setBudgetExclusions } from "../budgets/budget-queries";
import { useSupabase } from "../instance/instance-context";
import { useSignedInUser } from "../auth/session";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import {
  readRecentTransactions,
  readTitleSuggestions,
  readTransaction,
  readTransactionHistory,
  readTransactions,
} from "./read-transactions";
import type { Database } from "../supabase/database";

export function useTransactions(filter: TransactionFilter) {
  const filterKey = JSON.stringify(filter);
  const [paging, setPaging] = useState({ filterKey, count: pageSize });
  if (paging.filterKey !== filterKey) setPaging({ filterKey, count: pageSize });
  const count = paging.filterKey === filterKey ? paging.count : pageSize;
  const result = useCopyQuery(["transactions", "list", filter, count], ({ rows }) => {
    const matching = readTransactions(rows, filter);
    return { transactions: matching.slice(0, count), hasMore: matching.length > count };
  });
  return {
    ...result,
    showMore: () => setPaging({ filterKey, count: count + pageSize }),
  };
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
  return useTransactionMutation(
    async ({ id, excludedBudgetIds, ...draft }: TransactionDraft & Exclusions & { id: string }) => {
      const { error } = await supabase.rpc("add_transaction", {
        transaction_id: id,
        ...draftArgs(draft),
      });
      if (error) throw error;
      if (excludedBudgetIds.length > 0) await setBudgetExclusions(supabase, id, excludedBudgetIds);
    },
  );
}

export function useUpdateTransaction(transactionId: string) {
  const supabase = useSupabase();
  return useTransactionMutation(
    async ({ excludedBudgetIds, ...draft }: TransactionDraft & Exclusions) => {
      const { error } = await supabase.rpc("update_transaction", {
        transaction_id: transactionId,
        ...draftArgs(draft),
      });
      if (error) throw error;
      await setBudgetExclusions(supabase, transactionId, excludedBudgetIds);
    },
  );
}

export function useDeleteTransaction(transactionId: string) {
  const supabase = useSupabase();
  return useTransactionMutation(async () => {
    const { error } = await supabase.rpc("delete_transaction", { transaction_id: transactionId });
    if (error) throw error;
  });
}

export function useRestoreTransaction(transactionId: string) {
  const supabase = useSupabase();
  return useTransactionMutation(async () => {
    const { error } = await supabase.rpc("restore_transaction", { transaction_id: transactionId });
    if (error) throw error;
  });
}

// A transaction moves balances, counts in its category and shows in its spaces' activity, all of
// which are read from the copy; budgets still read the instance.
function useTransactionMutation<Input>(mutationFn: (input: Input) => Promise<void>) {
  return useCopyMutation(mutationFn, [["budgets"]]);
}

// A draft may still hold what another type used; only what its own type uses is saved.
function draftArgs(draft: TransactionDraft) {
  const isTransfer = draft.type === "transfer";
  return {
    transaction_type: draft.type,
    transaction_date: draft.date,
    title: draft.title,
    note: draft.note,
    account: draft.accountId,
    amount: draft.amount,
    category: isTransfer ? null : draft.categoryId,
    to_account: isTransfer ? draft.toAccountId : null,
    to_amount: isTransfer ? draft.toAmount : null,
  };
}

const pageSize = 50;

type Exclusions = { excludedBudgetIds: string[] };

export type Transaction = Database["public"]["Views"]["transaction_details"]["Row"];

export type TransactionType = Database["public"]["Enums"]["transaction_type"];

// Each part narrows the list further; dates are inclusive.
export type TransactionFilter = {
  spaceIds?: string[];
  accountIds?: string[];
  categoryIds?: string[];
  from?: string;
  to?: string;
  search?: string;
};

// Amounts in minor units of the account they leave or reach, always above zero.
export type TransactionDraft = {
  type: TransactionType;
  date: string;
  title: string;
  note: string;
  accountId: string;
  amount: number;
  categoryId: string | null;
  toAccountId: string | null;
  toAmount: number | null;
};

export type TitleSuggestion =
  Database["public"]["Functions"]["title_suggestions"]["Returns"][number];
