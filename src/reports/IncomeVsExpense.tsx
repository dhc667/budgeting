import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayToDate } from "../format/days";
import { useFormat } from "../format/use-format";
import { Card } from "../ui/Card";
import { firstDayOf } from "./periods";
import type { IncomeExpenseReport } from "./report-math";
import type { ReportData } from "./report-queries";
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
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: "short", year: "numeric" });

  const chartData = months.map(({ month, income, expense }) => ({
    name: monthName.format(dayToDate(firstDayOf(month))),
    income,
    expense,
  }));

  return (
    <Card title={t("reports.incomeExpense.title")}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} stroke="var(--color-zinc-200)" />
          <XAxis dataKey="name" minTickGap={8} />
          <YAxis width="auto" tickFormatter={money} />
          <Tooltip formatter={(amount) => money(Number(amount))} />
          <Bar
            dataKey="income"
            name={t("reports.incomeExpense.income")}
            fill="var(--color-emerald-500)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="expense"
            name={t("reports.incomeExpense.expense")}
            fill="var(--color-red-400)"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
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
