import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProfile } from "../profile/profile-queries";
import { type Currency, formatDate, formatMoney } from "./format";

export function useFormat() {
  const { i18n } = useTranslation();
  const { data: profile } = useProfile();
  const language = i18n.language;
  const numberFormat = profile?.number_format ?? null;
  const dateFormat = profile?.date_format ?? null;

  return useMemo(
    () => ({
      money: (minorUnits: number, currency: Currency) =>
        formatMoney(minorUnits, currency, numberFormat, language),
      date: (date: Date) => formatDate(date, dateFormat),
    }),
    [language, numberFormat, dateFormat],
  );
}
