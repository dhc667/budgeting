import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { dayToDate } from "../format/days";
import { useFormat } from "../format/use-format";
import { Card } from "../ui/Card";
import { firstDayOf } from "./periods";
import type { IncomeExpenseReport } from "./report-math";
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

export function IncomeVsExpense({
  report: { months, missing },
  data,
}: {
  report: IncomeExpenseReport;
  data: ReportData;
}) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const money = (amount: number) => format.money(amount, data.conversion.currency);
  const chartMoney = useChartMoney(data.conversion.currency);
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: "short", year: "numeric" });

  const chartData = months.map(({ month, income, expense }) => ({
    name: monthName.format(dayToDate(firstDayOf(month))),
    income,
    expense,
  }));

  return (
    <Card title={t("reports.incomeExpense.title")}>
      <ChartFrame height={chartHeight.incomeExpense}>
        <BarChart data={chartData} aria-label={t("reports.incomeExpense.chart")}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="name" minTickGap={8} {...axisProps} />
          <YAxis width="auto" tickFormatter={chartMoney.compact} {...axisProps} />
          <Tooltip {...tooltipStyle} formatter={chartMoney.full} />
          <Bar
            dataKey="income"
            name={t("reports.incomeExpense.income")}
            fill={series.income}
            {...noAnimation}
          />
          <Bar
            dataKey="expense"
            name={t("reports.incomeExpense.expense")}
            fill={series.expense}
            {...noAnimation}
          />
        </BarChart>
      </ChartFrame>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="py-1 font-medium">{t("reports.incomeExpense.month")}</th>
            <th className="py-1 text-right font-medium">{t("reports.incomeExpense.income")}</th>
            <th className="py-1 text-right font-medium">{t("reports.incomeExpense.expense")}</th>
            <th className="py-1 text-right font-medium">{t("reports.incomeExpense.difference")}</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {months.map((month) => (
            <tr key={month.month} className="border-t border-zinc-100 dark:border-zinc-800">
              <th scope="row" className="py-2 text-left font-normal">
                {monthName.format(dayToDate(firstDayOf(month.month)))}
              </th>
              <td className="py-2 text-right align-top">{money(month.income)}</td>
              <td className="py-2 text-right align-top">{money(month.expense)}</td>
              <td
                className={`py-2 text-right align-top ${month.difference < 0 ? "text-red-600 dark:text-red-400" : ""}`}
              >
                {money(month.difference)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Unconverted missing={missing} />
    </Card>
  );
}
