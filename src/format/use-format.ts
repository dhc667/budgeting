import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProfile } from "../profile/profile-queries";
import { dayToDate } from "./days";
import { type Currency, formatAmount, formatDate, formatMoney, parseAmount } from "./format";

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
      amount: (minorUnits: number, decimals: number) =>
        formatAmount(minorUnits, decimals, numberFormat),
      parseAmount: (text: string, decimals: number) => parseAmount(text, decimals, numberFormat),
      date: (date: Date) => formatDate(date, dateFormat),
      day: (day: string) => formatDate(dayToDate(day), dateFormat),
      time: (date: Date) => new Intl.DateTimeFormat(language, { timeStyle: "short" }).format(date),
    }),
    [language, numberFormat, dateFormat],
  );
}
