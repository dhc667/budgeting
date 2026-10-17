import { useParams } from "react-router";
import { type Account, useAccounts } from "./account-queries";

// Undefined while the accounts load, null when the route names none of them.
export function useRoutedAccount(): Account | null | undefined {
  const { accountId } = useParams();
  const { data: accounts } = useAccounts();
  if (!accounts) return undefined;
  return accounts.find(({ id }) => id === accountId) ?? null;
}
