import { readRateHistory } from "../budgets/read-budgets";
import { useCurrencies } from "../money/currency-queries";
import { useProfile } from "../profile/profile-queries";
import { useShownSpaces } from "../spaces/space-picker";
import type { Space } from "../spaces/space-queries";
import { useCopyQuery } from "../sync/copy-query";
import {
  type AccountMovement,
  type CategoryFlow,
  readAccountMovements,
  readCategoryFlows,
} from "./read-reports";
import type { Display } from "./report-math";

export type ReportData = {
  spaces: Space[];
  flows: CategoryFlow[];
  movements: AccountMovement[];
  display: Display;
};

// Undefined until everything the reports need has loaded.
export function useReportData(): ReportData | undefined {
  const spaces = useShownSpaces();
  const spaceIds = (spaces ?? []).map(({ id }) => id).sort();
  const { data: flows } = useCopyQuery(["reports", "flows", spaceIds], ({ rows }) =>
    readCategoryFlows(rows, spaceIds),
  );
  const { data: movements } = useCopyQuery(["reports", "movements", spaceIds], ({ rows }) =>
    readAccountMovements(rows, spaceIds),
  );
  const { data: currencies } = useCurrencies();
  const { data: profile } = useProfile();
  const display = currencies?.find(({ code }) => code === profile?.display_currency);

  const dated = [...(flows ?? []), ...(movements ?? [])];
  const codes = [
    ...new Set([profile?.display_currency ?? "USD", ...dated.map(({ currency }) => currency)]),
  ]
    .filter((code) => code !== "USD")
    .sort();
  const firstDay = dated.map(({ day }) => day).sort()[0];
  const { data: history } = useCopyQuery(["rate-history", codes, firstDay], ({ rows }) =>
    readRateHistory(rows, codes, firstDay),
  );

  if (!spaces || !flows || !movements || !currencies || !display || !history) return undefined;
  return { spaces, flows, movements, display: { currencies, currency: display, history } };
}
