import { useSupabase } from "../instance/instance-context";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
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
