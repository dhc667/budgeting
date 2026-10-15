import { Constants, type Enums } from "../supabase/database.types";

export type NumberFormat = Enums<"number_format">;
export type DateFormat = Enums<"date_format">;

export const numberFormats = Constants.public.Enums.number_format;
export const dateFormats = Constants.public.Enums.date_format;

// A null format means Automatic: the device's own convention.

export function formatMoney(amount: number, currency: string, format: NumberFormat | null): string {
  return new Intl.NumberFormat(numberLocale(format), { style: "currency", currency }).format(
    amount,
  );
}

export function formatNumber(value: number, format: NumberFormat | null): string {
  return new Intl.NumberFormat(numberLocale(format)).format(value);
}

export function formatDate(date: Date, format: DateFormat | null): string {
  if (!format) {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return {
    day_month_year: `${day}/${month}/${year}`,
    month_day_year: `${month}/${day}/${year}`,
    year_month_day: `${year}-${month}-${day}`,
  }[format];
}

export function currencyName(code: string, language: string): string {
  return new Intl.DisplayNames(language, { type: "currency" }).of(code) ?? code;
}

// A locale whose convention matches each format, so the currency symbol lands where people who
// write numbers that way expect it. Brazil rather than Germany for 1.234,56, so the symbol leads.
function numberLocale(format: NumberFormat | null): string | undefined {
  if (!format) return undefined;
  return {
    comma_period: "en-US",
    period_comma: "pt-BR",
    space_comma: "fr-FR",
    apostrophe_period: "de-CH",
  }[format];
}
