import { useState } from "react";
import { useTranslation } from "react-i18next";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { spaceName } from "../spaces/space";
import { Card, EmptyState } from "../ui/Card";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { lastMonth, type Period, thisMonth, thisYear } from "./periods";
import type { ReportData } from "./report-queries";
import { spendingByCategory } from "./report-math";
import { Unconverted } from "./Unconverted";

export function SpendingByCategory({ data }: { data: ReportData }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [period, setPeriod] = useState(() => thisMonth(localToday()));
  const { total, categories, missing } = spendingByCategory(data.flows, period, data.display);
  const today = localToday();
  const showSpace = data.spaces.length > 1;

  return (
    <Card title={t("reports.spending.title")}>
      <PeriodChoice period={period} onChange={setPeriod} today={today} />
      {categories.length === 0 ? (
        <EmptyState>{t("reports.spending.none")}</EmptyState>
      ) : (
        <>
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-zinc-500">{t("reports.spending.total")}</span>
            <span className="text-2xl font-semibold tabular-nums">
              {format.money(total, data.display.currency)}
            </span>
          </p>
          <ul className="flex flex-col gap-3">
            {categories.map((category) => {
              const space = data.spaces.find(({ id }) => id === category.spaceId);
              const share = total > 0 ? Math.max(category.amount, 0) / total : 0;
              return (
                <li key={category.categoryId} className="flex flex-col gap-1">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="truncate">
                      {category.name}
                      {showSpace && space && (
                        <span className="ml-2 text-xs text-zinc-500">{spaceName(space, t)}</span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span>{format.money(category.amount, data.display.currency)}</span>
                      <span className="ml-2 text-xs text-zinc-500">{format.percent(share)}</span>
                    </span>
                  </p>
                  <div aria-hidden className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${share * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Unconverted missing={missing} />
    </Card>
  );
}

function PeriodChoice({
  period,
  onChange,
  today,
}: {
  period: Period;
  onChange: (period: Period) => void;
  today: string;
}) {
  const { t } = useTranslation();
  const quick = [
    { name: t("reports.spending.thisMonth"), period: thisMonth(today) },
    { name: t("reports.spending.lastMonth"), period: lastMonth(today) },
    { name: t("reports.spending.thisYear"), period: thisYear(today) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("reports.spending.from")}
          type="date"
          value={period.from}
          onChange={(event) => onChange({ ...period, from: event.target.value })}
        />
        <Field
          label={t("reports.spending.to")}
          type="date"
          value={period.to}
          onChange={(event) => onChange({ ...period, to: event.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {quick.map((choice) => (
          <Button
            key={choice.name}
            variant="secondary"
            className="h-9 px-3 text-sm"
            onClick={() => onChange(choice.period)}
          >
            {choice.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
