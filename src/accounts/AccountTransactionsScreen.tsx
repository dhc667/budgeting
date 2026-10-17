import { useTranslation } from "react-i18next";
import { TransactionList } from "../transactions/TransactionList";
import { AccountSubscreen } from "./AccountSubscreen";

export function AccountTransactionsScreen() {
  const { t } = useTranslation();
  return (
    <AccountSubscreen title={t("transactions.title")}>
      {(account) => <TransactionList filter={{ accountId: account.id }} />}
    </AccountSubscreen>
  );
}
