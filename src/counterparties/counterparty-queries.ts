import { useSupabase } from "../instance/instance-context";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import { readTransactions } from "../transactions/read-transactions";
import { addTransaction, type TransactionDraft } from "../transactions/transaction-writes";
import {
  type CounterpartyDetails,
  createCounterparty,
  deleteCounterparty,
  updateCounterparty,
} from "./counterparty-writes";
import { readCounterparties } from "./read-counterparties";

export function useCounterparties() {
  return useCopyQuery(["counterparties"], ({ rows }) => readCounterparties(rows));
}

// All of them, unpaged.
export function useCounterpartyTransactions(counterpartyId: string) {
  return useCopyQuery(["counterparties", counterpartyId, "transactions"], ({ rows }) =>
    readTransactions(rows, { counterpartyIds: [counterpartyId] }),
  );
}

// Each forgiven debt is a transaction of its own. Their ids come from the app, so sending them all
// again after only some were saved saves each once.
export function useForgive() {
  const supabase = useSupabase();
  return useCopyMutation(async (forgiven: { id: string; draft: TransactionDraft }[]) => {
    await Promise.all(forgiven.map(({ id, draft }) => addTransaction(supabase, id, draft)));
  });
}

export function useCreateCounterparty() {
  const supabase = useSupabase();
  return useCopyMutation(({ spaceId, ...details }: CounterpartyDetails & { spaceId: string }) =>
    createCounterparty(supabase, spaceId, details),
  );
}

export function useUpdateCounterparty(counterpartyId: string) {
  const supabase = useSupabase();
  return useCopyMutation((details: CounterpartyDetails) =>
    updateCounterparty(supabase, counterpartyId, details),
  );
}

export function useDeleteCounterparty(counterpartyId: string) {
  const supabase = useSupabase();
  return useCopyMutation(() => deleteCounterparty(supabase, counterpartyId));
}
