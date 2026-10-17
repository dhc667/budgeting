import { useTranslation } from "react-i18next";
import { ActivityList } from "../spaces/ActivityList";
import { useAccountHistory } from "./account-queries";
import { AccountSubscreen } from "./AccountSubscreen";

export function AccountHistoryScreen() {
  const { t } = useTranslation();
  return (
    <AccountSubscreen title={t("accounts.history")}>
      {(account) => <AccountHistory accountId={account.id} />}
    </AccountSubscreen>
  );
}

function AccountHistory({ accountId }: { accountId: string }) {
  const { data: history } = useAccountHistory(accountId);
  return <ActivityList activity={history} />;
}
