import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "../instance/instance-context";
import type { Database } from "../supabase/database";
import type { Activity } from "../spaces/space-queries";
import type { TransactionDraft } from "../transactions/transaction-queries";
import type { Schedule } from "./schedule";

export function useRecurringTransactions() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["recurring"],
    async queryFn(): Promise<RecurringTransaction[]> {
      const { data, error } = await supabase
        .from("recurring_transactions")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateRecurringTransaction() {
  const supabase = useSupabase();
  return useRecurringMutation(async ({ draft, schedule, recordFirst }: NewRecurring) => {
    const { error } = await supabase.rpc("create_recurring_transaction", {
      ...templateArgs(draft),
      ...scheduleArgs(schedule),
      record_first: recordFirst,
    });
    if (error) throw error;
  });
}

export function useRecurringHistory(ruleId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["recurring", ruleId, "history"],
    async queryFn(): Promise<Activity[]> {
      const { data, error } = await supabase.rpc("recurring_transaction_history", {
        recurring_transaction_id: ruleId,
      });
      if (error) throw error;
      return data;
    },
  });
}

// Refused if one was recorded or skipped since the member opened it. `restart` counts the schedule
// from its new start, with nothing done.
export function useUpdateRecurringTransaction(rule: RecurringTransaction) {
  const supabase = useSupabase();
  return useRecurringMutation(async ({ draft, schedule, restart }: RuleEdit) => {
    const { error } = await supabase.rpc("update_recurring_transaction", {
      recurring_transaction_id: rule.id,
      seen_done: rule.done,
      ...templateArgs(draft),
      ...scheduleArgs(schedule),
      restart,
    });
    if (error) throw error;
  });
}

export function usePauseRecurringTransaction(rule: RecurringTransaction) {
  const supabase = useSupabase();
  return useRecurringMutation(async () => {
    const { error } = await supabase.rpc("pause_recurring_transaction", {
      recurring_transaction_id: rule.id,
    });
    if (error) throw error;
  });
}

export function useResumeRecurringTransaction(rule: RecurringTransaction) {
  const supabase = useSupabase();
  return useRecurringMutation(async (nextOccurrence: number) => {
    const { error } = await supabase.rpc("resume_recurring_transaction", {
      recurring_transaction_id: rule.id,
      seen_done: rule.done,
      next_occurrence: nextOccurrence,
    });
    if (error) throw error;
  });
}

export function useDeleteRecurringTransaction(rule: RecurringTransaction) {
  const supabase = useSupabase();
  return useRecurringMutation(async () => {
    const { error } = await supabase.rpc("delete_recurring_transaction", {
      recurring_transaction_id: rule.id,
    });
    if (error) throw error;
  });
}

// `occurrence` is the one the member saw: if another recorded or skipped it meanwhile, it's refused.
export function useRecordUpcoming() {
  const supabase = useSupabase();
  return useRecurringMutation(async ({ rule, occurrence, date, amount, toAmount }: Recording) => {
    const { error } = await supabase.rpc("record_recurring_transaction", {
      recurring_transaction_id: rule.id,
      occurrence,
      transaction_date: date,
      amount,
      to_amount: toAmount,
    });
    if (error) throw error;
  });
}

export function useSkipUpcoming() {
  const supabase = useSupabase();
  return useRecurringMutation(async ({ rule, occurrence }: Upcoming) => {
    const { error } = await supabase.rpc("skip_recurring_transaction", {
      recurring_transaction_id: rule.id,
      occurrence,
    });
    if (error) throw error;
  });
}

// Recording one moves balances, so everything a transaction touches is read again.
function useRecurringMutation<Input>(mutationFn: (input: Input) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        ["recurring", "transactions", "accounts", "categories", "spaces"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

// A draft may still hold what another type used; only what its own type uses is saved.
function templateArgs(draft: Omit<TransactionDraft, "date">) {
  const isTransfer = draft.type === "transfer";
  return {
    transaction_type: draft.type,
    title: draft.title,
    note: draft.note,
    account: draft.accountId,
    amount: draft.amount,
    category: isTransfer ? null : draft.categoryId,
    to_account: isTransfer ? draft.toAccountId : null,
    to_amount: isTransfer ? draft.toAmount : null,
  };
}

function scheduleArgs(schedule: Schedule) {
  return {
    starts_on: schedule.startsOn,
    every: schedule.every,
    unit: schedule.unit,
    ends_on: schedule.endsOn,
    times: schedule.times,
  };
}

export function scheduleOf(rule: RecurringTransaction): Schedule {
  return {
    startsOn: rule.starts_on,
    every: rule.every,
    unit: rule.unit,
    endsOn: rule.ends_on,
    times: rule.times,
  };
}

export type RecurringTransaction = Database["public"]["Tables"]["recurring_transactions"]["Row"];

export type Upcoming = { rule: RecurringTransaction; occurrence: number; due: string };

// Amounts in minor units, like a draft's.
type Recording = Upcoming & { date: string; amount: number; toAmount: number | null };

type RuleEdit = { draft: TransactionDraft; schedule: Schedule; restart: boolean };

// The draft's date is where the schedule starts.
type NewRecurring = { draft: TransactionDraft; schedule: Schedule; recordFirst: boolean };
