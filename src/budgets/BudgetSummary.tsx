import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { useMoney } from "../money/use-money";
import { type Budget, type BudgetProgress, useBudgetProgress } from "./budget-queries";
import { type Allowance, dailyAllowance, type PeriodProgress } from "./periods";

// The current period, or the latest when none holds today: a repeating budget that hasn't started,
// or a fixed one that has ended.
export function BudgetSummary({ budget }: { budget: Budget }) {
  const progress = useBudgetProgress(budget);
  if (!progress) return <div className="h-24" />;
  return <LoadedSummary budget={budget} progress={progress} />;
}

function LoadedSummary({ budget, progress }: { budget: Budget; progress: BudgetProgress }) {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useMoney();
  const today = localToday();
  const period = progress.current ?? progress.periods.at(-1);
  if (!period) return null;
  const over = period.spent > period.limit;
  const share = period.limit <= 0 ? 1 : Math.min(Math.max(period.spent / period.limit, 0), 1);

  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-2xl font-semibold tabular-nums">
          {money(period.spent, budget.currency)}
        </span>
        <span className="text-sm text-zinc-500 tabular-nums">
          {t("budgets.ofLimit", { limit: money(period.limit, budget.currency) })}
        </span>
      </p>
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <p className={`text-sm ${over ? "text-red-600 dark:text-red-400" : ""}`}>
        {standing(period, today, t, (amount) => money(amount, budget.currency), format.day)}
      </p>
      <p className="text-xs text-zinc-500">
        {t("budgets.period", { start: format.day(period.start), end: format.day(period.end) })}
      </p>
      {progress.unconverted.length > 0 && (
        <p className="text-xs text-zinc-500">
          {t("budgets.unconverted", { currencies: progress.unconverted.join(", ") })}
        </p>
      )}
    </div>
  );
}

function standing(
  period: PeriodProgress,
  today: string,
  t: TFunction,
  money: (amount: number) => string,
  day: (day: string) => string,
): string {
  if (today < period.start) return t("budgets.startsOn", { date: day(period.start) });
  const allowance = dailyAllowance(period, today);
  if (allowance) return allowanceText(allowance, period, t, money);
  return period.spent > period.limit
    ? t("budgets.endedOver", { amount: money(period.spent - period.limit) })
    : t("budgets.endedUnder", { amount: money(period.limit - period.spent) });
}

function allowanceText(
  allowance: Allowance,
  period: PeriodProgress,
  t: TFunction,
  money: (amount: number) => string,
): string {
  switch (allowance.kind) {
    case "per-day":
      return t("budgets.perDay", { amount: money(allowance.amount), count: allowance.daysLeft });
    case "over":
      return t("budgets.over", {
        amount: money(period.spent - period.limit),
        count: allowance.daysLeft,
      });
  }
}
