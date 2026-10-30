import { useSupabase } from "../instance/instance-context";
import type { Database } from "../supabase/database";
import { useCopyMutation, useCopyQuery } from "../sync/copy-query";
import {
  type AccountDetails,
  archiveAccount,
  createAccount,
  deleteAccount,
  reorderAccounts,
  updateAccount,
} from "./account-writes";
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
  return useCopyMutation(({ spaceId, ...details }: AccountDetails & { spaceId: string }) =>
    createAccount(supabase, spaceId, details),
  );
}

export function useUpdateAccount(accountId: string) {
  const supabase = useSupabase();
  return useCopyMutation((details: AccountDetails) => updateAccount(supabase, accountId, details));
}

export function useArchiveAccount(accountId: string) {
  const supabase = useSupabase();
  return useCopyMutation((archived: boolean) => archiveAccount(supabase, accountId, archived));
}

export function useDeleteAccount(accountId: string) {
  const supabase = useSupabase();
  return useCopyMutation(() => deleteAccount(supabase, accountId));
}

export function useReorderAccounts() {
  const supabase = useSupabase();
  return useCopyMutation((accountIds: string[]) => reorderAccounts(supabase, accountIds));
}

// The accounts new money can still move through in a space.
export function openAccountsIn(accounts: Account[], spaceId: string): Account[] {
  return accounts.filter(({ space_id, archived }) => space_id === spaceId && !archived);
}

export type Account = Database["public"]["Views"]["accounts"]["Row"];
