import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProfile } from "../profile/profile-queries";
import { dayToDate } from "./days";
import {
  type Currency,
  decimalSeparator,
  formatAmount,
  formatCompactMoney,
  formatDate,
  formatMoney,
  parseAmount,
} from "./format";

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
      compactMoney: (minorUnits: number, currency: Currency) =>
        formatCompactMoney(minorUnits, currency, numberFormat, language),
      amount: (minorUnits: number, decimals: number) =>
        formatAmount(minorUnits, decimals, numberFormat),
      parseAmount: (text: string, decimals: number) => parseAmount(text, decimals, numberFormat),
      decimalSeparator: decimalSeparator(numberFormat),
      date: (date: Date) => formatDate(date, dateFormat),
      day: (day: string) => formatDate(dayToDate(day), dateFormat),
      time: (date: Date) => new Intl.DateTimeFormat(language, { timeStyle: "short" }).format(date),
      percent: (share: number) =>
        new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 }).format(
          share,
        ),
    }),
    [language, numberFormat, dateFormat],
  );
}
