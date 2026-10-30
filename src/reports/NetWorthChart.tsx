import { useTranslation } from "react-i18next";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Currency } from "../format/format";
import { useFormat } from "../format/use-format";
import { StaleRateNotes } from "../rates/StaleRateNotes";
import { useNetWorthToday } from "../rates/use-net-worth";
import { Card, EmptyState } from "../ui/Card";
import type { NetWorthPoint } from "./report-math";
import type { ReportData } from "./report-queries";
import { ChartFrame } from "./ChartFrame";
import {
  axisProps,
  chartHeight,
  gridProps,
  noAnimation,
  series,
  tooltipStyle,
  useChartMoney,
} from "./chart-style";
import { Unconverted } from "./Unconverted";

export function NetWorthChart({ data }: { data: ReportData }) {
  const { t } = useTranslation();
  const format = useFormat();
  const today = useNetWorthToday(data.spaces);
  const { points, missing, hasDebts } = data.netWorth;
  const { currency } = data.conversion;
  const first = points[0];
  const last = points.at(-1);
  const money = (amount: number) => format.money(amount, currency);

  return (
    <Card title={t("reports.netWorth.title")}>
      {first && last ? (
        <>
          <dl className="flex flex-wrap justify-between gap-x-6 gap-y-1">
            <div>
              <dt className="text-xs text-zinc-500">
                {t("reports.netWorth.on", { date: format.day(first.day) })}
              </dt>
              <dd className="tabular-nums">{money(first.total)}</dd>
            </div>
            <div className="text-right">
              <dt className="text-xs text-zinc-500">{t("reports.netWorth.today")}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{money(last.total)}</dd>
              {hasDebts && (
                <dd className="text-zinc-500 tabular-nums">
                  {t("reports.netWorth.afterDebtsAmount", { amount: money(last.afterDebts) })}
                </dd>
              )}
            </div>
          </dl>
          <NetWorthLine points={points} currency={currency} hasDebts={hasDebts} />
        </>
      ) : (
        <EmptyState>{t("reports.netWorth.none")}</EmptyState>
      )}
      <StaleRateNotes rates={today?.staleRates ?? []} />
      <Unconverted missing={missing} />
    </Card>
  );
}

type NetWorthLineProps = { points: NetWorthPoint[]; currency: Currency; hasDebts: boolean };

function NetWorthLine({ points, currency, hasDebts }: NetWorthLineProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useChartMoney(currency);

  return (
    <ChartFrame height={chartHeight.netWorth}>
      <LineChart data={points} aria-label={t("reports.netWorth.chart")}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="day" tickFormatter={format.day} minTickGap={32} {...axisProps} />
        <YAxis width="auto" tickFormatter={money.compact} {...axisProps} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(day) => (typeof day === "string" ? format.day(day) : day)}
          formatter={money.full}
        />
        {/* Drawn first, so the net worth line covers it wherever debts make no difference. */}
        {hasDebts && (
          <Line
            dataKey="afterDebts"
            name={t("reports.netWorth.afterDebts")}
            stroke={series.afterDebts}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            {...noAnimation}
          />
        )}
        <Line
          dataKey="total"
          name={t("reports.netWorth.total")}
          stroke={series.line}
          strokeWidth={2}
          dot={false}
          {...noAnimation}
        />
        {hasDebts && <Legend />}
      </LineChart>
    </ChartFrame>
  );
}
