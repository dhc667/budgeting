import { useSupabase } from "../instance/instance-context";
import type { Color } from "../colors/colors";
import type { Space } from "../spaces/space-queries";
import type { Database } from "../supabase/database";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import { readAccountHistory, readAccounts } from "./read-accounts";

export function useAccounts() {
  return useCopyQuery(["accounts"], ({ rows }) => readAccounts(rows));
}

export function useAccountHistory(accountId: string) {
  return useCopyQuery(["accounts", accountId, "history"], ({ rows }) =>
    readAccountHistory(rows, accountId),
  );
}

export function useCreateAccount() {
  const supabase = useSupabase();
  return useCopyMutation(async ({ spaceId, ...details }: AccountDetails & { spaceId: string }) => {
    const { data, error } = await supabase.rpc("create_account", {
      space: spaceId,
      ...detailsArgs(details),
    });
    if (error) throw error;
    return data;
  });
}

export function useUpdateAccount(accountId: string) {
  const supabase = useSupabase();
  return useCopyMutation(async (details: AccountDetails) => {
    const { error } = await supabase.rpc("update_account", {
      account_id: accountId,
      ...detailsArgs(details),
    });
    if (error) throw error;
  });
}

export function useArchiveAccount(accountId: string) {
  const supabase = useSupabase();
  return useCopyMutation(async (archived: boolean) => {
    const { error } = await supabase.from("accounts").update({ archived }).eq("id", accountId);
    if (error) throw error;
  });
}

export function useDeleteAccount(accountId: string) {
  const supabase = useSupabase();
  return useCopyMutation(async () => {
    const { error } = await supabase.from("accounts").delete().eq("id", accountId);
    if (error) throw error;
  });
}

export function useReorderAccounts() {
  const supabase = useSupabase();
  return useCopyMutation(async (accountIds: string[]) => {
    const { error } = await supabase.rpc("reorder_accounts", { account_ids: accountIds });
    if (error) throw error;
  });
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

export function accountsInSpaces(accounts: Account[], spaces: Pick<Space, "id">[]): Account[] {
  return accounts.filter(({ space_id }) => spaces.some(({ id }) => id === space_id));
}

export type Account = Database["public"]["Views"]["accounts"]["Row"];

export type AccountDetails = {
  name: string;
  currency: string;
  color: Color;
  openingAmount: number;
  openingDate: string;
};
