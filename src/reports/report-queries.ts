import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { builtInCategoryName } from "../categories/category";
import { localToday } from "../format/days";
import { useCurrencies } from "../money/currency-queries";
import { useProfile } from "../profile/profile-queries";
import type { DisplayConversion } from "../rates/convert-dated";
import { useRateHistory } from "../rates/rate-queries";
import { useShownSpaces } from "../spaces/space-picker";
import type { Space } from "../spaces/space-queries";
import { useCopyQuery } from "../sync/copy-query";
import { type CategoryFlow, readAccountMovements, readCategoryFlows } from "./read-reports";
import { type NetWorthSeries, netWorthSeries } from "./report-math";

// `data` is undefined until everything the reports need has loaded.
export function useReportData(): { data: ReportData | undefined; failed: boolean } {
  const spaces = useShownSpaces();
  const spaceIds = useMemo(() => (spaces ?? []).map(({ id }) => id).sort(), [spaces]);
  const { t, i18n } = useTranslation();
  const flowsQuery = useCopyQuery(["reports", "flows", spaceIds, i18n.language], ({ rows }) =>
    readCategoryFlows(rows, spaceIds, (builtIn) => builtInCategoryName(builtIn, t)),
  );
  const movementsQuery = useCopyQuery(["reports", "movements", spaceIds], ({ rows }) =>
    readAccountMovements(rows, spaceIds),
  );
  const { data: flows } = flowsQuery;
  const { data: movements } = movementsQuery;
  const { data: currencies } = useCurrencies();
  const { data: profile } = useProfile();
  const displayCurrency = currencies?.find(({ code }) => code === profile?.display_currency);

  const dated = useMemo(() => [...(flows ?? []), ...(movements ?? [])], [flows, movements]);
  const historyQuery = useRateHistory(profile?.display_currency ?? "USD", dated);
  const { data: history } = historyQuery;

  const conversion = useMemo(
    () =>
      currencies && displayCurrency && history
        ? { currencies, currency: displayCurrency, history }
        : undefined,
    [currencies, displayCurrency, history],
  );
  const netWorth = useMemo(
    () =>
      movements && conversion ? netWorthSeries(movements, localToday(), conversion) : undefined,
    [movements, conversion],
  );

  const failed = [flowsQuery, movementsQuery, historyQuery].some(({ error }) => error !== null);
  const data = useMemo(
    () =>
      spaces && flows && conversion && netWorth
        ? { spaces, flows, conversion, netWorth }
        : undefined,
    [spaces, flows, conversion, netWorth],
  );
  return { data, failed };
}

export type ReportData = {
  spaces: Space[];
  flows: CategoryFlow[];
  conversion: DisplayConversion;
  netWorth: NetWorthSeries;
};
