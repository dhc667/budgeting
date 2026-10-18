import { ColorDot } from "../colors/ColorDot";
import { useMoney } from "../money/use-money";
import type { PickerOption } from "../ui/Picker";
import type { Account } from "./account-queries";

export function useAccountOption(): (account: Account) => PickerOption {
  const money = useMoney();
  return (account) => ({
    id: account.id,
    label: account.name,
    icon: <ColorDot color={account.color} />,
    content: (
      <>
        <ColorDot color={account.color} />
        <span className="flex-1 truncate">{account.name}</span>
        <span className="text-sm text-zinc-500 tabular-nums">
          {money(account.balance, account.currency)}
        </span>
      </>
    ),
  });
}
