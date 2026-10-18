import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { type Account, useAccounts } from "../accounts/account-queries";
import { useCounterparties } from "../counterparties/counterparty-queries";
import type { Counterparty } from "../counterparties/read-counterparties";
import { localToday } from "../format/days";
import { useCreateRecurringTransaction } from "../recurring/recurring-queries";
import { BackLink } from "../ui/BackLink";
import { Card, EmptyState } from "../ui/Card";
import { useLastAccount } from "./last-account";
import { useAddTransaction } from "./transaction-queries";
import { TransactionForm } from "./TransactionForm";

export function NewTransactionScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: accounts } = useAccounts();
  const { data: counterparties } = useCounterparties();
  const [params] = useSearchParams();
  const { lastAccountId, remember } = useLastAccount();
  const addTransaction = useAddTransaction();
  const createRecurring = useCreateRecurringTransaction();
  // One id for every attempt, so a retry after a lost reply can't save it twice.
  const [id] = useState(() => crypto.randomUUID());
  if (!accounts || !counterparties) return null;
  const counterparty = counterparties.find(({ id }) => id === params.get("counterparty"));
  const backTo = counterparty ? `/counterparties/${counterparty.id}` : "/transactions";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to={backTo} place={counterparty ? counterparty.name : t("nav.transactions")} />
        <h1 className="text-2xl font-semibold">{t("transactions.new.title")}</h1>
      </header>
      {accounts.some(({ archived }) => !archived) ? (
        <Card title={t("transactions.details")}>
          <TransactionForm
            initial={{
              type: counterparty ? debtType(params.get("type")) : "expense",
              date: localToday(),
              title: "",
              note: "",
              accountId: accountFor(counterparty, accounts, lastAccountId) ?? "",
              amount: 0,
              categoryId: null,
              toAccountId: null,
              toAmount: null,
              counterpartyId: counterparty?.id ?? null,
            }}
            keptAccountIds={[]}
            submitLabel={t("transactions.new.submit")}
            mutation={{
              isPending: addTransaction.isPending || createRecurring.isPending,
              isSuccess: false,
              error: addTransaction.error ?? createRecurring.error,
            }}
            saving={{
              kind: "transaction",
              excludedBudgetIds: [],
              onSave: (draft, extras) =>
                addTransaction.mutate(
                  { ...draft, ...extras, id },
                  {
                    onSuccess: () => {
                      remember(draft.accountId);
                      void navigate(backTo);
                    },
                  },
                ),
              onRepeat: (draft, schedule, recordFirst) =>
                createRecurring.mutate(
                  { draft, schedule, recordFirst },
                  {
                    onSuccess: () => {
                      remember(draft.accountId);
                      void navigate("/recurring");
                    },
                  },
                ),
            }}
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

function debtType(type: string | null): "given" | "received" {
  return type === "received" ? "received" : "given";
}

// Money given or received stays in the counterparty's space, so the account must be there too.
function accountFor(
  counterparty: Counterparty | undefined,
  accounts: Account[],
  lastAccountId: string | null,
): string | null {
  if (!counterparty) return lastAccountId;
  const inSpace = accounts.filter(
    ({ space_id, archived }) => space_id === counterparty.space_id && !archived,
  );
  return (inSpace.find(({ id }) => id === lastAccountId) ?? inSpace[0])?.id ?? null;
}
