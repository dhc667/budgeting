import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "../instance/instance-context";
import type { Color } from "../colors/colors";
import type { Database } from "../supabase/database";

export function useAccounts() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["accounts"],
    async queryFn(): Promise<Account[]> {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("position")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useAccountHistory(accountId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["accounts", accountId, "history"],
    async queryFn() {
      const { data, error } = await supabase.rpc("account_history", { account_id: accountId });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateAccount() {
  const supabase = useSupabase();
  return useAccountMutation(
    async ({ spaceId, ...details }: AccountDetails & { spaceId: string }) => {
      const { data, error } = await supabase.rpc("create_account", {
        space: spaceId,
        ...detailsArgs(details),
      });
      if (error) throw error;
      return data;
    },
  );
}

export function useUpdateAccount(accountId: string) {
  const supabase = useSupabase();
  return useAccountMutation(async (details: AccountDetails) => {
    const { error } = await supabase.rpc("update_account", {
      account_id: accountId,
      ...detailsArgs(details),
    });
    if (error) throw error;
  });
}

export function useArchiveAccount(accountId: string) {
  const supabase = useSupabase();
  return useAccountMutation(async (archived: boolean) => {
    const { error } = await supabase.from("accounts").update({ archived }).eq("id", accountId);
    if (error) throw error;
  });
}

export function useDeleteAccount(accountId: string) {
  const supabase = useSupabase();
  return useAccountMutation(async () => {
    const { error } = await supabase.from("accounts").delete().eq("id", accountId);
    if (error) throw error;
  });
}

export function useReorderAccounts() {
  const supabase = useSupabase();
  return useAccountMutation(async (accountIds: string[]) => {
    const { error } = await supabase.rpc("reorder_accounts", { account_ids: accountIds });
    if (error) throw error;
  });
}

// Account changes show up in their space's activity too.
function useAccountMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["spaces"] }),
      ]),
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

export type Account = Database["public"]["Views"]["accounts"]["Row"];

export type AccountDetails = {
  name: string;
  currency: string;
  color: Color;
  openingAmount: number;
  openingDate: string;
};
