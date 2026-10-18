import { useState } from "react";
import { useTranslation } from "react-i18next";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { spaceName } from "../spaces/space";
import { CategoryIcon } from "../categories/CategoryIcon";
import { Card, EmptyState } from "../ui/Card";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import type { DateRange } from "../format/days";
import { allTime, lastMonth, thisMonth, thisYear } from "./periods";
import type { ReportData } from "./report-queries";
import type { SpendingReport } from "./report-math";
import { SpendingPie } from "./SpendingPie";
import { Unconverted } from "./Unconverted";

export function SpendingByCategory({
  report: { total, categories, missing },
  period,
  onPeriodChange,
  data,
}: {
  report: SpendingReport;
  period: DateRange;
  onPeriodChange: (period: DateRange) => void;
  data: ReportData;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const today = localToday();
  const showSpace = data.spaces.length > 1;
  const [selected, setSelected] = useState<string | null>(null);
  const toggle = (categoryId: string) =>
    setSelected((current) => (current === categoryId ? null : categoryId));

  return (
    <Card title={t("reports.spending.title")}>
      <PeriodChoice period={period} onChange={onPeriodChange} today={today} />
      {categories.length === 0 ? (
        <EmptyState>{t("reports.spending.none")}</EmptyState>
      ) : (
        <>
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-zinc-500">{t("reports.spending.total")}</span>
            <span className="text-2xl font-semibold tabular-nums">
              {format.money(total, data.conversion.currency)}
            </span>
          </p>
          <SpendingPie categories={categories} selected={selected} onSelect={toggle} />
          <ul className="-mx-2 flex flex-col gap-1">
            {categories.map((category) => {
              const space = data.spaces.find(({ id }) => id === category.spaceId);
              return (
                <li key={category.categoryId}>
                  <button
                    type="button"
                    aria-pressed={category.categoryId === selected}
                    onClick={() => toggle(category.categoryId)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-zinc-100 aria-pressed:bg-zinc-100 dark:hover:bg-zinc-800 dark:aria-pressed:bg-zinc-800"
                  >
                    <CategoryIcon icon={category.icon} color={category.color} />
                    <span className="min-w-0 flex-1 truncate">
                      {category.name}
                      {showSpace && space && (
                        <span className="ml-2 text-xs text-zinc-500">{spaceName(space, t)}</span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span>{format.money(category.amount, data.conversion.currency)}</span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {format.percent(category.share)}
                      </span>
                    </span>
                  </button>
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
  period: DateRange;
  onChange: (period: DateRange) => void;
  today: string;
}) {
  const { t } = useTranslation();
  const quick = [
    { name: t("reports.spending.thisMonth"), period: thisMonth(today) },
    { name: t("reports.spending.lastMonth"), period: lastMonth(today) },
    { name: t("reports.spending.thisYear"), period: thisYear(today) },
    { name: t("reports.spending.allTime"), period: allTime },
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
            aria-pressed={choice.period.from === period.from && choice.period.to === period.to}
            className="h-9 px-3 text-sm aria-pressed:border-emerald-600 aria-pressed:text-emerald-700 dark:aria-pressed:border-emerald-500 dark:aria-pressed:text-emerald-400"
            onClick={() => onChange(choice.period)}
          >
            {choice.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
