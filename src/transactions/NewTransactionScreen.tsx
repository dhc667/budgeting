import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { useAccounts } from "../accounts/account-queries";
import { localToday } from "../format/days";
import { BackLink } from "../ui/BackLink";
import { Card, EmptyState } from "../ui/Card";
import { useLastAccount } from "./last-account";
import { useAddTransaction } from "./transaction-queries";
import { TransactionForm } from "./TransactionForm";

export function NewTransactionScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: accounts } = useAccounts();
  const { lastAccountId, remember } = useLastAccount();
  const addTransaction = useAddTransaction();
  // One id for every attempt, so a retry after a lost reply can't save it twice.
  const [id] = useState(() => crypto.randomUUID());
  if (!accounts) return null;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/transactions" place={t("nav.transactions")} />
        <h1 className="text-2xl font-semibold">{t("transactions.new.title")}</h1>
      </header>
      {accounts.some(({ archived }) => !archived) ? (
        <Card title={t("transactions.details")}>
          <TransactionForm
            initial={{
              type: "expense",
              date: localToday(),
              title: "",
              note: "",
              accountId: lastAccountId ?? "",
              amount: 0,
              categoryId: null,
              toAccountId: null,
              toAmount: null,
            }}
            keptAccountIds={[]}
            submitLabel={t("transactions.new.submit")}
            mutation={addTransaction}
            onSave={(draft) =>
              addTransaction.mutate(
                { ...draft, id },
                {
                  onSuccess: () => {
                    remember(draft.accountId);
                    void navigate("/transactions");
                  },
                },
              )
            }
          />
        </Card>
      ) : (
        <>
          <EmptyState>{t("transactions.new.noAccounts")}</EmptyState>
          <Link to="/accounts/new" className="font-medium text-emerald-700 dark:text-emerald-400">
            {t("accounts.add")}
          </Link>
        </>
      )}
    </div>
  );
}
