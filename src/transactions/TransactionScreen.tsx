import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { useAccounts } from "../accounts/account-queries";
import { useBudgetExclusions } from "../budgets/budget-queries";
import { type Category, useCategories } from "../categories/category-queries";
import { useCounterparties } from "../counterparties/counterparty-queries";
import { useFormat } from "../format/use-format";
import { useMoney } from "../money/use-money";
import { displayNameOf, useUsers } from "../profile/profile-queries";
import { afterSuccess } from "../query-client";
import { ActivityList } from "../spaces/ActivityList";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { Card, EmptyState } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ErrorText } from "../ui/ErrorText";
import {
  accountsOf,
  type ShownAmount,
  shownAmount,
  signedAmount,
  transactionLabel,
} from "./transaction";
import { draftOf } from "./transaction-writes";
import {
  type Transaction,
  useDeleteTransaction,
  useTransaction,
  useTransactionHistory,
  useUpdateTransaction,
} from "./transaction-queries";
import { useListAddress } from "./list-filters";
import { TransactionForm } from "./TransactionForm";

export function TransactionScreen() {
  const { t } = useTranslation();
  const format = useFormat();
  const { transactionId = "" } = useParams();
  const { data: transaction } = useTransaction(transactionId);
  const { data: categories } = useCategories();
  const { data: counterparties } = useCounterparties();
  const { data: users = [] } = useUsers();
  const listAddress = useListAddress();
  if (transaction === undefined || !categories || !counterparties) return null;
  if (transaction === null) return <TransactionNotFound />;
  const label = transactionLabel(transaction, categories, counterparties, t);

  // Keyed so that another transaction's screen starts with a fresh form rather than this one's.
  return (
    <div key={transaction.id} className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to={listAddress} place={t("nav.transactions")} />
        <h1 className="text-2xl font-semibold">{label}</h1>
        <p className="text-sm text-zinc-500">
          {t("transactions.addedBy", {
            name: displayNameOf(users, transaction.created_by) ?? t("activity.someone"),
            date: format.date(new Date(transaction.created_at)),
          })}
        </p>
      </header>
      {transaction.one_sided ? (
        <OneSidedCard transaction={transaction} />
      ) : (
        <>
          <EditCard transaction={transaction} categories={categories} />
          <DeleteCard transaction={transaction} label={label} />
        </>
      )}
      <HistoryCard transaction={transaction} />
    </div>
  );
}

function TransactionNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <EmptyState>{t("transactions.notFound")}</EmptyState>
      <Link to="/transactions" className="font-medium text-emerald-700 dark:text-emerald-400">
        {t("transactions.backToList")}
      </Link>
    </div>
  );
}

function EditCard({
  transaction,
  categories,
}: {
  transaction: Transaction;
  categories: Category[];
}) {
  const { t } = useTranslation();
  const updateTransaction = useUpdateTransaction(transaction.id);
  const { data: excludedBudgetIds } = useBudgetExclusions(transaction.id);
  if (!excludedBudgetIds) return null;
  return (
    <Card title={t("transactions.details")}>
      <TransactionForm
        initial={draftOf(transaction, categories)}
        keptAccountIds={accountsOf(transaction)}
        submitLabel={t("transactions.form.save")}
        mutation={updateTransaction}
        saving={{
          kind: "transaction",
          excludedBudgetIds,
          onSave: (draft, extras) => updateTransaction.mutate({ ...draft, ...extras }),
        }}
      />
    </Card>
  );
}

// A transfer from or to a space the user isn't in: they see their side, and can't change it.
function OneSidedCard({ transaction }: { transaction: Transaction }) {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useMoney();
  const { data: accounts = [] } = useAccounts();
  const amount = shownAmount(transaction);
  const account = accounts.find(({ id }) => id === amount.accountId)?.name ?? "";

  return (
    <Card title={t("transactions.details")}>
      <p className="text-3xl font-semibold tabular-nums">
        {money(signedAmount(amount), amount.currency)}
      </p>
      <p>{oneSidedMessage(amount, account, t)}</p>
      <p className="text-sm text-zinc-500">{format.day(transaction.date)}</p>
      {transaction.note !== null && <p>{transaction.note}</p>}
      <p className="text-sm text-zinc-500">{t("transactions.oneSided.explained")}</p>
    </Card>
  );
}

function oneSidedMessage(amount: ShownAmount, account: string, t: TFunction): string {
  switch (amount.direction) {
    case "out":
      return t("transactions.oneSided.toAnotherSpace", { account });
    case "in":
      return t("transactions.oneSided.fromAnotherSpace", { account });
    case "between":
      throw new Error("A one-sided transfer shows only one of its accounts");
  }
}

function DeleteCard({ transaction, label }: { transaction: Transaction; label: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const deleteTransaction = useDeleteTransaction(transaction.id);
  const listAddress = useListAddress();
  const confirm = () => afterSuccess(deleteTransaction.mutateAsync(), () => navigate(listAddress));

  return (
    <Card title={t("transactions.delete.title")}>
      <p className="text-sm text-zinc-500">{t("transactions.delete.explained")}</p>
      <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
        {t("transactions.delete.submit")}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t("transactions.delete.confirmTitle", { label })}
        confirmLabel={t("transactions.delete.confirm")}
        danger
        pending={deleteTransaction.isPending}
        onConfirm={confirm}
        onCancel={() => {
          deleteTransaction.reset();
          setConfirming(false);
        }}
      >
        {deleteTransaction.error && <ErrorText>{t("transactions.errors.deleteFailed")}</ErrorText>}
      </ConfirmDialog>
    </Card>
  );
}

function HistoryCard({ transaction }: { transaction: Transaction }) {
  const { t } = useTranslation();
  const { data: history } = useTransactionHistory(transaction.id);
  return (
    <Card title={t("transactions.history")}>
      <ActivityList activity={history} />
    </Card>
  );
}
