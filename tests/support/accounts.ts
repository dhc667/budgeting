import type { SignedInUser } from "./local-instance";
import { today } from "./dates";

export async function addAccount(
  user: SignedInUser,
  spaceId: string,
  name: string,
  { openingAmount = 10_000, currency = "USD" } = {},
): Promise<string> {
  const { data, error } = await user.client.rpc("create_account", {
    space: spaceId,
    account_name: name,
    account_currency: currency,
    account_color: "blue",
    opening_amount: openingAmount,
    opening_date: today(),
  });
  if (error) throw error;
  return data;
}
