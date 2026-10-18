import { useTranslation } from "react-i18next";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { Card, EmptyState } from "../ui/Card";
import { type NetWorthPoint, netWorthSeries } from "./report-math";
import type { ReportData } from "./report-queries";
import { Unconverted } from "./Unconverted";

export function NetWorthChart({ data }: { data: ReportData }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { points, missing } = netWorthSeries(data.movements, localToday(), data.display);
  const first = points[0];
  const last = points.at(-1);
  const money = (amount: number) => format.money(amount, data.display.currency);

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
            </div>
          </dl>
          <Line
            points={points}
            label={t("reports.netWorth.chart", {
              start: money(first.total),
              startDate: format.day(first.day),
              end: money(last.total),
            })}
          />
        </>
      ) : (
        <EmptyState>{t("reports.netWorth.none")}</EmptyState>
      )}
      <Unconverted missing={missing} />
    </Card>
  );
}

const width = 600;
const height = 160;
const padding = 4;

function Line({ points, label }: { points: NetWorthPoint[]; label: string }) {
  const totals = points.map(({ total }) => total);
  const low = Math.min(...totals);
  const span = Math.max(...totals) - low;
  const x = (index: number) =>
    points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
  const y = (total: number) =>
    span === 0 ? height / 2 : height - padding - ((total - low) / span) * (height - 2 * padding);
  const path = points.map(({ total }, index) => `${x(index)},${y(total)}`).join(" ");

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-40 w-full text-emerald-600 dark:text-emerald-400"
    >
      <polyline
        points={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
