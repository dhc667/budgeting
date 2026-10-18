import { useTranslation } from "react-i18next";
import { IncomeVsExpense } from "./IncomeVsExpense";
import { NetWorthChart } from "./NetWorthChart";
import { useReportData } from "./report-queries";
import { SpendingByCategory } from "./SpendingByCategory";

export function ReportsScreen() {
  const { t } = useTranslation();
  const data = useReportData();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("reports.title")}</h1>
      {data && (
        <>
          <SpendingByCategory data={data} />
          <IncomeVsExpense data={data} />
          <NetWorthChart data={data} />
        </>
      )}
    </div>
  );
}
