import { useTranslation } from "react-i18next";
import { useFormat } from "../format/use-format";
import type { LatestRate } from "./convert";

export function StaleRateNotes({ rates }: { rates: readonly LatestRate[] }) {
  const { t } = useTranslation();
  const format = useFormat();
  return rates.map((rate) => (
    <p key={rate.currency} className="text-sm text-zinc-500">
      {t("dashboard.netWorthStale", { currency: rate.currency, date: format.day(rate.date) })}
    </p>
  ));
}
