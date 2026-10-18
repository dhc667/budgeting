import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { accountsInSpaces, useAccounts } from "../accounts/account-queries";
import type { Currency } from "../format/format";
import { useFormat } from "../format/use-format";
import { netWorth } from "../rates/net-worth";
import { useLatestRates } from "../rates/rate-queries";
import { StaleRateNotes } from "../rates/StaleRateNotes";
import { Card, EmptyState } from "../ui/Card";
import type { NetWorthPoint } from "./report-math";
import type { ReportData } from "./report-queries";
import { Unconverted } from "./Unconverted";

export function NetWorthChart({ data }: { data: ReportData }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: accounts } = useAccounts();
  const { data: latestRates } = useLatestRates();
  const { points, missing } = data.netWorth;
  const { currencies, currency } = data.conversion;
  const staleRates =
    accounts && latestRates
      ? netWorth(accountsInSpaces(accounts, data.spaces), currencies, currency, latestRates)
          .staleRates
      : [];
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
            </div>
          </dl>
          <NetWorthLine points={points} currency={currency} />
        </>
      ) : (
        <EmptyState>{t("reports.netWorth.none")}</EmptyState>
      )}
      <StaleRateNotes rates={staleRates} />
      <Unconverted missing={missing} />
    </Card>
  );
}

function NetWorthLine({ points, currency }: { points: NetWorthPoint[]; currency: Currency }) {
  const format = useFormat();
  const money = (amount: number) => format.money(amount, currency);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={points}>
        <CartesianGrid vertical={false} stroke="var(--color-zinc-200)" />
        <XAxis dataKey="day" tickFormatter={format.day} minTickGap={32} />
        <YAxis width="auto" tickFormatter={money} domain={["auto", "auto"]} />
        <Tooltip
          labelFormatter={(day) => (typeof day === "string" ? format.day(day) : day)}
          formatter={(total) => money(Number(total))}
        />
        <Line
          dataKey="total"
          stroke="var(--color-emerald-600)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
