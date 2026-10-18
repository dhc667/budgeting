import { useTranslation } from "react-i18next";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { Card } from "../ui/Card";
import { firstDayOf, lastMonths } from "./periods";
import { incomeVsExpense } from "./report-math";
import type { ReportData } from "./report-queries";
import { Unconverted } from "./Unconverted";

const monthsShown = 12;

export function IncomeVsExpense({ data }: { data: ReportData }) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const { months, missing } = incomeVsExpense(
    data.flows,
    lastMonths(monthsShown, localToday()),
    data.display,
  );
  const biggest = Math.max(...months.flatMap(({ income, expense }) => [income, expense]), 0);
  const money = (amount: number) => format.money(amount, data.display.currency);
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: "short", year: "numeric" });

  return (
    <Card title={t("reports.incomeExpense.title")}>
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
                {monthName.format(new Date(`${firstDayOf(month.month)}T12:00:00`))}
                <Bars income={month.income} expense={month.expense} biggest={biggest} />
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

function Bars({ income, expense, biggest }: { income: number; expense: number; biggest: number }) {
  const width = (amount: number) => `${biggest > 0 ? (Math.max(amount, 0) / biggest) * 100 : 0}%`;
  return (
    <span aria-hidden className="mt-1 flex flex-col gap-0.5">
      <span className="h-1.5 rounded-full bg-emerald-500" style={{ width: width(income) }} />
      <span className="h-1.5 rounded-full bg-red-400" style={{ width: width(expense) }} />
    </span>
  );
}
