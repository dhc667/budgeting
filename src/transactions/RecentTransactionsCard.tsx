import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useShownSpaces } from "../spaces/space-picker";
import { Card } from "../ui/Card";
import { useRecentTransactions } from "./transaction-queries";
import { TransactionGroups } from "./TransactionList";

export function RecentTransactionsCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const shownSpaces = useShownSpaces();
  const { data: transactions } = useRecentTransactions(
    shownSpaces?.map(({ id }) => id),
    5,
  );

  return (
    <Card
      title={t("dashboard.recent")}
      className={className}
      action={
        <Link
          to="/transactions"
          className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
        >
          {t("transactions.seeAll")}
        </Link>
      }
    >
      {transactions && <TransactionGroups transactions={transactions} />}
    </Card>
  );
}
