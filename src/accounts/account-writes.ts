// Shared with the app CLI, which runs under Node's type stripping: import only with extensions.
import type { AppSupabase } from "../supabase/client.ts";
import type { Enums } from "../supabase/database.types.ts";

export async function createAccount(
  supabase: AppSupabase,
  spaceId: string,
  details: AccountDetails,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_account", {
    space: spaceId,
    ...detailsArgs(details),
  });
  if (error) throw error;
  return data;
}

export async function updateAccount(
  supabase: AppSupabase,
  accountId: string,
  details: AccountDetails,
) {
  const { error } = await supabase.rpc("update_account", {
    account_id: accountId,
    ...detailsArgs(details),
  });
  if (error) throw error;
}

export async function archiveAccount(supabase: AppSupabase, accountId: string, archived: boolean) {
  const { error } = await supabase.from("accounts").update({ archived }).eq("id", accountId);
  if (error) throw error;
}

export async function deleteAccount(supabase: AppSupabase, accountId: string) {
  const { error } = await supabase.from("accounts").delete().eq("id", accountId);
  if (error) throw error;
}

export async function reorderAccounts(supabase: AppSupabase, accountIds: string[]) {
  const { error } = await supabase.rpc("reorder_accounts", { account_ids: accountIds });
  if (error) throw error;
}

function detailsArgs(details: AccountDetails) {
  return {
    account_name: details.name,
    account_currency: details.currency,
    account_color: details.color,
    opening_amount: details.openingAmount,
    opening_date: details.openingDate,
  };
}

export type AccountDetails = {
  name: string;
  currency: string;
  color: Enums<"color">;
  openingAmount: number;
  openingDate: string;
};
