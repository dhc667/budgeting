import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { type Account, useAccounts } from "../accounts/account-queries";
import { type Category, useCategories } from "../categories/category-queries";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { afterSuccess } from "../query-client";
import { ActivityList } from "../spaces/ActivityList";
import { accountsOf, transactionLabel } from "../transactions/transaction";
import { draftOf } from "../transactions/transaction-writes";
import { TransactionForm } from "../transactions/TransactionForm";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { Card, EmptyState } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ErrorText } from "../ui/ErrorText";
import { asTransaction, scheduleName, shownSchedule, wasRescheduled } from "./recurring";
import {
  type RecurringTransaction,
  scheduleOf,
  useDeleteRecurringTransaction,
  usePauseRecurringTransaction,
  useRecurringHistory,
  useRecurringTransactions,
  useResumeRecurringTransaction,
  useUpdateRecurringTransaction,
} from "./recurring-queries";
import { firstDueFrom, nextDueDate } from "./schedule";

export function RecurringTransactionScreen() {
  const { t } = useTranslation();
  const format = useFormat();
  const { ruleId = "" } = useParams();
  const { data: rules } = useRecurringTransactions();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  if (!rules || !accounts || !categories) return null;
  const rule = rules.find(({ id }) => id === ruleId);
  if (!rule) return <RuleNotFound />;
  const label = transactionLabel(asTransaction(rule, accounts), categories, t);
  const schedule = scheduleOf(rule);
  const next = nextDueDate(schedule, rule.done);

  // Keyed so that a rule changed elsewhere, or moved on, starts its form afresh.
  return (
    <div key={`${rule.id}-${rule.done}`} className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/recurring" place={t("recurring.title")} />
        <h1 className="text-2xl font-semibold">{label}</h1>
        <p className="text-sm text-zinc-500">
          {scheduleName(schedule, t)} ·{" "}
          {rule.paused
            ? t("recurring.paused")
            : next === null
              ? t("recurring.ended")
              : t("recurring.next", { date: format.day(next) })}
        </p>
      </header>
      <EditCard rule={rule} accounts={accounts} categories={categories} />
      <PauseCard rule={rule} />
      <DeleteCard rule={rule} label={label} />
      <HistoryCard rule={rule} />
    </div>
  );
}

function RuleNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <EmptyState>{t("recurring.notFound")}</EmptyState>
      <Link to="/recurring" className="font-medium text-emerald-700 dark:text-emerald-400">
        {t("recurring.backToList")}
      </Link>
    </div>
  );
}

type EditCardProps = { rule: RecurringTransaction; accounts: Account[]; categories: Category[] };

function EditCard({ rule, accounts, categories }: EditCardProps) {
  const { t } = useTranslation();
  const update = useUpdateRecurringTransaction(rule);
  const transaction = asTransaction(rule, accounts);
  const shown = shownSchedule(rule, localToday());

  return (
    <Card title={t("transactions.details")}>
      <TransactionForm
        initial={{ ...draftOf(transaction, categories), date: shown.startsOn }}
        keptAccountIds={accountsOf(transaction)}
        submitLabel={t("transactions.form.save")}
        mutation={update}
        saving={{
          kind: "rule",
          schedule: shown,
          onSave: (draft, edited) => {
            const restart = wasRescheduled(shown, edited);
            update.mutate({ draft, schedule: restart ? edited : scheduleOf(rule), restart });
          },
        }}
      />
    </Card>
  );
}

function PauseCard({ rule }: { rule: RecurringTransaction }) {
  const { t } = useTranslation();
  const pause = usePauseRecurringTransaction(rule);
  const resume = useResumeRecurringTransaction(rule);
  const resumeAt = firstDueFrom(scheduleOf(rule), rule.done, localToday()) ?? rule.done;

  return (
    <Card title={rule.paused ? t("recurring.resume.title") : t("recurring.pause.title")}>
      <p className="text-sm text-zinc-500">
        {rule.paused ? t("recurring.resume.explained") : t("recurring.pause.explained")}
      </p>
      {rule.paused ? (
        <Button
          variant="secondary"
          className="self-start"
          disabled={resume.isPending}
          onClick={() => resume.mutate(resumeAt)}
        >
          {t("recurring.resume.submit")}
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          disabled={pause.isPending}
          onClick={() => pause.mutate()}
        >
          {t("recurring.pause.submit")}
        </Button>
      )}
      {(pause.error ?? resume.error) && <ErrorText>{t("recurring.errors.saveFailed")}</ErrorText>}
    </Card>
  );
}

function DeleteCard({ rule, label }: { rule: RecurringTransaction; label: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const deleteRule = useDeleteRecurringTransaction(rule);
  const confirm = () => afterSuccess(deleteRule.mutateAsync(), () => navigate("/recurring"));

  return (
    <Card title={t("recurring.delete.title")}>
      <p className="text-sm text-zinc-500">{t("recurring.delete.explained")}</p>
      <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
        {t("recurring.delete.submit")}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t("recurring.delete.confirmTitle", { label })}
        confirmLabel={t("recurring.delete.confirm")}
        danger
        pending={deleteRule.isPending}
        onConfirm={confirm}
        onCancel={() => {
          deleteRule.reset();
          setConfirming(false);
        }}
      >
        {deleteRule.error && <ErrorText>{t("recurring.errors.deleteFailed")}</ErrorText>}
      </ConfirmDialog>
    </Card>
  );
}

function HistoryCard({ rule }: { rule: RecurringTransaction }) {
  const { t } = useTranslation();
  const { data: history } = useRecurringHistory(rule.id);
  return (
    <Card title={t("transactions.history")}>
      <ActivityList activity={history} />
    </Card>
  );
}
