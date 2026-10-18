import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { localToday } from "../format/days";
import { earliestMissing } from "../rates/convert-dated";
import { useBackfillMissingRates } from "../rates/rate-queries";
import { ErrorText } from "../ui/ErrorText";
import { IncomeVsExpense } from "./IncomeVsExpense";
import { NetWorthChart } from "./NetWorthChart";
import { lastMonths, thisMonth } from "./periods";
import { categoryTotals, incomeVsExpense } from "./report-math";
import { type ReportData, useReportData } from "./report-queries";
import { ByCategory, type FlowKind } from "./ByCategory";

const monthsShown = 12;

export function ReportsScreen() {
  const { t } = useTranslation();
  const { data, failed } = useReportData();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("reports.title")}</h1>
      {failed && <ErrorText>{t("reports.errors.loadFailed")}</ErrorText>}
      {data && <Reports data={data} />}
    </div>
  );
}

// The rates sync is nudged once for the whole screen, whichever report lacked a rate.
function Reports({ data }: { data: ReportData }) {
  const [period, setPeriod] = useState(() => thisMonth(localToday()));
  const [kind, setKind] = useState<FlowKind>("expense");
  const byCategory = categoryTotals(data.flows, kind, period, data.conversion);
  const incomeExpense = useMemo(
    () => incomeVsExpense(data.flows, lastMonths(monthsShown, localToday()), data.conversion),
    [data.flows, data.conversion],
  );
  useBackfillMissingRates(
    earliestMissing(byCategory.missing, incomeExpense.missing, data.netWorth.missing),
  );

  return (
    <>
      <ByCategory
        report={byCategory}
        kind={kind}
        onKindChange={setKind}
        period={period}
        onPeriodChange={setPeriod}
        data={data}
      />
      <IncomeVsExpense report={incomeExpense} data={data} />
      <NetWorthChart data={data} />
    </>
  );
}
