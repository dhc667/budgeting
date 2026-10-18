// Shared with the app CLI, which runs under Node's type stripping: import only with extensions.
import type { AppSupabase } from "../supabase/client.ts";
import type { Enums } from "../supabase/database.types.ts";

// An id generated beforehand makes a retry save the counterparty once.
export async function createCounterparty(
  supabase: AppSupabase,
  spaceId: string,
  { name, color }: CounterpartyDetails,
  id?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_counterparty", {
    space: spaceId,
    counterparty_name: name,
    counterparty_color: color,
    counterparty_id: id,
  });
  if (error) throw error;
  return data;
}

export async function updateCounterparty(
  supabase: AppSupabase,
  counterpartyId: string,
  { name, color }: CounterpartyDetails,
) {
  const { error } = await supabase.rpc("update_counterparty", {
    counterparty_id: counterpartyId,
    counterparty_name: name,
    counterparty_color: color,
  });
  if (error) throw error;
}

export async function deleteCounterparty(supabase: AppSupabase, counterpartyId: string) {
  const { error } = await supabase.rpc("delete_counterparty", { counterparty_id: counterpartyId });
  if (error) throw error;
}

export type CounterpartyDetails = { name: string; color: Enums<"color"> };
