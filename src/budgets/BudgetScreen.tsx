import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { useMoney } from "../money/use-money";
import { afterSuccess } from "../query-client";
import { scheduleName } from "../recurring/recurring";
import { ActivityList } from "../spaces/ActivityList";
import { spaceName } from "../spaces/space";
import { type Space, useSpaces } from "../spaces/space-queries";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { Card, EmptyState } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ErrorText } from "../ui/ErrorText";
import {
  type Budget,
  detailsOf,
  useBudgetHistory,
  useBudgetProgress,
  useBudgets,
  useDeleteBudget,
  useUpdateBudget,
} from "./budget-queries";
import { BudgetForm } from "./BudgetForm";
import { BudgetSummary } from "./BudgetSummary";
import type { PeriodProgress } from "./periods";

export function BudgetScreen() {
  const { t } = useTranslation();
  const { budgetId = "" } = useParams();
  const { data: budgets } = useBudgets();
  const { data: spaces } = useSpaces();
  if (!budgets || !spaces) return null;
  const budget = budgets.find(({ id }) => id === budgetId);
  if (!budget) return <BudgetNotFound />;

  // Keyed so that another budget's screen starts with a fresh form rather than this one's.
  return (
    <div key={budget.id} className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/budgets" place={t("budgets.title")} />
        <h1 className="text-2xl font-semibold">{budget.name}</h1>
        <p className="text-sm text-zinc-500">{lengthDescription(budget, spaces, t)}</p>
      </header>
      <Card title={t("budgets.standing")}>
        <BudgetSummary budget={budget} />
      </Card>
      <PastPeriodsCard budget={budget} />
      <EditCard budget={budget} />
      <DeleteCard budget={budget} />
      <HistoryCard budget={budget} />
    </div>
  );
}

function lengthDescription(budget: Budget, spaces: Space[], t: TFunction): string {
  const space = spaces.find(({ id }) => id === budget.space_id);
  const length =
    budget.every !== null && budget.unit !== null
      ? scheduleName({ every: budget.every, unit: budget.unit }, t)
      : t("budgets.fixed");
  return space ? `${length} · ${spaceName(space, t)}` : length;
}

function BudgetNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <EmptyState>{t("budgets.notFound")}</EmptyState>
      <Link to="/budgets" className="font-medium text-emerald-700 dark:text-emerald-400">
        {t("budgets.backToList")}
      </Link>
    </div>
  );
}

// Newest first. Only a repeating budget has any, as a fixed one's single period shows above.
function PastPeriodsCard({ budget }: { budget: Budget }) {
  const { t } = useTranslation();
  const progress = useBudgetProgress(budget);
  const today = localToday();
  const past =
    budget.every === null ? [] : (progress?.periods.filter(({ end }) => end < today) ?? []);
  if (past.length === 0) return null;

  return (
    <Card title={t("budgets.pastPeriods")}>
      <ol className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
        {[...past].reverse().map((period) => (
          <li key={period.start}>
            <PastPeriod period={period} currency={budget.currency} />
          </li>
        ))}
      </ol>
    </Card>
  );
}

function PastPeriod({ period, currency }: { period: PeriodProgress; currency: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useMoney();
  const over = period.spent > period.limit;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="flex flex-col">
        <span>
          {t("budgets.period", { start: format.day(period.start), end: format.day(period.end) })}
        </span>
        <span className="text-sm text-zinc-500 tabular-nums">
          {t("budgets.spentOfLimit", {
            spent: money(period.spent, currency),
            limit: money(period.limit, currency),
          })}
        </span>
      </span>
      <span
        className={`shrink-0 text-sm font-medium ${over ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}
      >
        {over ? t("budgets.endedOverShort") : t("budgets.endedUnderShort")}
      </span>
    </div>
  );
}

function EditCard({ budget }: { budget: Budget }) {
  const { t } = useTranslation();
  const update = useUpdateBudget(budget.id);
  return (
    <Card title={t("budgets.details")}>
      <BudgetForm
        initial={detailsOf(budget)}
        spaceId={budget.space_id}
        submitLabel={t("budgets.form.save")}
        mutation={update}
        onSave={(details) => update.mutate(details)}
      />
    </Card>
  );
}

function DeleteCard({ budget }: { budget: Budget }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const deleteBudget = useDeleteBudget(budget.id);
  const confirm = () => afterSuccess(deleteBudget.mutateAsync(), () => navigate("/budgets"));

  return (
    <Card title={t("budgets.delete.title")}>
      <p className="text-sm text-zinc-500">{t("budgets.delete.explained")}</p>
      <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
        {t("budgets.delete.submit")}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t("budgets.delete.confirmTitle", { name: budget.name })}
        confirmLabel={t("budgets.delete.confirm")}
        danger
        pending={deleteBudget.isPending}
        onConfirm={confirm}
        onCancel={() => {
          deleteBudget.reset();
          setConfirming(false);
        }}
      >
        {deleteBudget.error && <ErrorText>{t("budgets.errors.deleteFailed")}</ErrorText>}
      </ConfirmDialog>
    </Card>
  );
}

function HistoryCard({ budget }: { budget: Budget }) {
  const { t } = useTranslation();
  const { data: history } = useBudgetHistory(budget.id);
  return (
    <Card title={t("transactions.history")}>
      <ActivityList activity={history} />
    </Card>
  );
}
