import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { setBudgetExclusions } from "../budgets/budget-queries";
import { useSupabase } from "../instance/instance-context";
import type { Activity } from "../activity/activity";
import type { AppSupabase } from "../supabase/client";
import { useCopyMutation } from "../sync/copy-query";
import type { Database } from "../supabase/database";

export function useTransactions(filter: TransactionFilter) {
  const supabase = useSupabase();
  return useInfiniteQuery({
    queryKey: ["transactions", "list", filter],
    initialPageParam: 0,
    async queryFn({ pageParam }): Promise<Transaction[]> {
      const { data, error } = await newestFirst(selectTransactions(supabase, filter)).range(
        pageParam,
        pageParam + pageSize - 1,
      );
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < pageSize ? undefined : pages.length * pageSize,
    placeholderData: keepPreviousData,
  });
}

// Waits for the spaces to show, rather than first asking for those of no space at all.
export function useRecentTransactions(spaceIds: string[] | undefined, count: number) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["transactions", "recent", spaceIds, count],
    enabled: spaceIds !== undefined,
    async queryFn(): Promise<Transaction[]> {
      const { data, error } = await newestFirst(
        selectTransactions(supabase, { spaceIds: spaceIds ?? [] }),
      ).limit(count);
      if (error) throw error;
      return data;
    },
  });
}

export function useTransaction(transactionId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["transactions", transactionId],
    async queryFn(): Promise<Transaction | null> {
      const { data, error } = await supabase
        .from("transaction_details")
        .select("*")
        .eq("id", transactionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useTransactionHistory(transactionId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["transactions", transactionId, "history"],
    async queryFn(): Promise<Activity[]> {
      const { data, error } = await supabase.rpc("transaction_history", {
        transaction_id: transactionId,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useTitleSuggestions() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["transactions", "titles"],
    async queryFn(): Promise<TitleSuggestion[]> {
      const { data, error } = await supabase.rpc("title_suggestions");
      if (error) throw error;
      return data;
    },
  });
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
// which are read from the copy; budgets and the transaction lists still read the instance.
function useTransactionMutation<Input>(mutationFn: (input: Input) => Promise<void>) {
  return useCopyMutation(mutationFn, [["transactions"], ["budgets"]]);
}

function selectTransactions(supabase: AppSupabase, filter: TransactionFilter) {
  let query = supabase.from("transaction_details").select("*");
  if (filter.spaceIds) query = query.overlaps("space_ids", filter.spaceIds);
  if (filter.accountIds) {
    const ids = filter.accountIds.join(",");
    query = query.or(`from_account_id.in.(${ids}),to_account_id.in.(${ids})`);
  }
  if (filter.categoryIds) query = query.in("category_id", filter.categoryIds);
  if (filter.from) query = query.gte("date", filter.from);
  if (filter.to) query = query.lte("date", filter.to);
  if (filter.search) query = query.ilike("search_text", containing(filter.search));
  return query;
}

// Without accents, as the view stores what searches match against, and with the wildcards the
// user typed taken literally.
function containing(search: string): string {
  const plain = search
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\\%_]/g, "\\$&");
  return `%${plain}%`;
}

function newestFirst(query: ReturnType<typeof selectTransactions>) {
  return query
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
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
