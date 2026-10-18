import { useTranslation } from "react-i18next";
import { useBackfillMissingRates } from "../budgets/budget-queries";
import type { MissingRate } from "./report-math";

export function Unconverted({ missing }: { missing: MissingRate[] }) {
  const { t } = useTranslation();
  useBackfillMissingRates(missing);
  if (missing.length === 0) return null;
  return (
    <p className="text-xs text-zinc-500">
      {t("reports.unconverted", { currencies: missing.map(({ currency }) => currency).join(", ") })}
    </p>
  );
}
