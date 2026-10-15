import { useMemo } from "react";
import { useProfile } from "../profile/profile-queries";
import { formatDate, formatMoney } from "./format";

export function useFormat() {
  const { data: profile } = useProfile();
  const numberFormat = profile?.number_format ?? null;
  const dateFormat = profile?.date_format ?? null;

  return useMemo(
    () => ({
      money: (amount: number, currency: string) => formatMoney(amount, currency, numberFormat),
      date: (date: Date) => formatDate(date, dateFormat),
    }),
    [numberFormat, dateFormat],
  );
}
