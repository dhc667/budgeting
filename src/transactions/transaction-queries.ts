import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "../instance/instance-context";
import type { Activity } from "../spaces/space-queries";
import type { AppSupabase } from "../supabase/client";
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
        selectTransactions(supabase, { kind: "spaces", spaceIds: spaceIds ?? [] }),
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

export function useAddTransaction() {
  const supabase = useSupabase();
  return useTransactionMutation(async ({ id, ...draft }: TransactionDraft & { id: string }) => {
    const { error } = await supabase.rpc("add_transaction", {
      transaction_id: id,
      ...draftArgs(draft),
    });
    if (error) throw error;
  });
}

export function useUpdateTransaction(transactionId: string) {
  const supabase = useSupabase();
  return useTransactionMutation(async (draft: TransactionDraft) => {
    const { error } = await supabase.rpc("update_transaction", {
      transaction_id: transactionId,
      ...draftArgs(draft),
    });
    if (error) throw error;
  });
}

export function useDeleteTransaction(transactionId: string) {
  const supabase = useSupabase();
  return useTransactionMutation(async () => {
    const { error } = await supabase.rpc("delete_transaction", { transaction_id: transactionId });
    if (error) throw error;
  });
}

// A transaction moves balances, counts in its category, and shows in its spaces' activity.
function useTransactionMutation<Input>(mutationFn: (input: Input) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        ["transactions", "accounts", "categories", "spaces"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

function selectTransactions(supabase: AppSupabase, filter: TransactionFilter) {
  const query = supabase.from("transaction_details").select("*");
  switch (filter.kind) {
    case "spaces":
      return query.overlaps("space_ids", filter.spaceIds);
    case "account":
      return query.or(
        `from_account_id.eq.${filter.accountId},to_account_id.eq.${filter.accountId}`,
      );
    case "categories":
      return query.in("category_id", filter.categoryIds);
  }
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

export type Transaction = Database["public"]["Views"]["transaction_details"]["Row"];

export type TransactionType = Database["public"]["Enums"]["transaction_type"];

export type TransactionFilter =
  | { kind: "spaces"; spaceIds: string[] }
  | { kind: "account"; accountId: string }
  | { kind: "categories"; categoryIds: string[] };

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
