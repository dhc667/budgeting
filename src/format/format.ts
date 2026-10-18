import { Constants, type Enums } from "../supabase/database.types";

export function formatMoney(
  minorUnits: number,
  currency: Currency,
  format: NumberFormat | null,
  language: string,
): string {
  if (!format) {
    return deviceFormat(minorUnits, currency.decimals, {
      style: "currency",
      currency: currency.code,
    });
  }
  const sign = minorUnits < 0 ? "-" : "";
  const amount = writeDigits(Math.abs(minorUnits), currency.decimals, conventions[format]);
  return withSymbol(sign, amount, currency, format, language);
}

// For axis ticks, where the full amount is too wide. Rounded, so only for reading at a glance.
export function formatCompactMoney(
  minorUnits: number,
  currency: Currency,
  format: NumberFormat | null,
  language: string,
): string {
  const major = minorUnits / 10 ** currency.decimals;
  const compact: Intl.NumberFormatOptions = { notation: "compact", maximumFractionDigits: 1 };
  if (!format) {
    return new Intl.NumberFormat(undefined, {
      ...compact,
      style: "currency",
      currency: currency.code,
    }).format(major);
  }
  const { group, decimal } = conventions[format];
  const amount = new Intl.NumberFormat(language, compact)
    .formatToParts(Math.abs(major))
    .map((part) => {
      switch (part.type) {
        case "decimal":
          return decimal;
        case "group":
          return group;
        default:
          return part.value;
      }
    })
    .join("");
  return withSymbol(minorUnits < 0 ? "-" : "", amount, currency, format, language);
}

function withSymbol(
  sign: string,
  amount: string,
  currency: Currency,
  format: NumberFormat,
  language: string,
): string {
  const { placement } = conventions[format];
  const symbol = currencySymbol(currency.code, language);
  if (placement === "after") return `${sign}${amount}${noBreakSpace}${symbol}`;
  const gap = placement === "before, spaced" || endsInLetter(symbol) ? noBreakSpace : "";
  return `${sign}${symbol}${gap}${amount}`;
}

export function formatAmount(
  minorUnits: number,
  decimals: number,
  format: NumberFormat | null,
): string {
  if (!format) return deviceFormat(minorUnits, decimals, {});
  const sign = minorUnits < 0 ? "-" : "";
  return sign + writeDigits(Math.abs(minorUnits), decimals, conventions[format]);
}

// Reads an amount the way formatAmount writes it, so typing follows the user's number format.
export function parseAmount(
  text: string,
  decimals: number,
  format: NumberFormat | null,
): number | null {
  const decimal = format ? conventions[format].decimal : deviceDecimalSeparator();
  const trimmed = text.trim();
  const negative = /^[-\u2212]/.test(trimmed);
  const parts = (negative ? trimmed.slice(1) : trimmed).split(decimal);
  if (parts.length > 2) return null;
  const whole = (parts[0] ?? "").replace(anyGroupingMark, "");
  const fraction = parts[1] ?? "";
  if (!/^\d+$/.test(whole + fraction) || !/^\d*$/.test(whole) || !/^\d*$/.test(fraction))
    return null;
  if (fraction.length > decimals) return null;
  const minorUnits = Number(whole + fraction.padEnd(decimals, "0"));
  if (!Number.isSafeInteger(minorUnits)) return null;
  return negative && minorUnits !== 0 ? -minorUnits : minorUnits;
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

// Intl takes the amount as a decimal string, so it is never a float on the way.
function deviceFormat(minorUnits: number, decimals: number, options: Intl.NumberFormatOptions) {
  const sign = minorUnits < 0 ? "-" : "";
  const decimal = sign + writeDigits(Math.abs(minorUnits), decimals, { group: "", decimal: "." });
  if (!isDecimal(decimal)) throw new Error(`Not a decimal: ${decimal}`);
  return new Intl.NumberFormat(undefined, {
    ...options,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(decimal);
}

function deviceDecimalSeparator(): string {
  const parts = new Intl.NumberFormat().formatToParts(1.5);
  return parts.find((part) => part.type === "decimal")?.value ?? ".";
}

function isDecimal(text: string): text is Intl.StringNumericLiteral {
  return /^-?\d+(\.\d+)?$/.test(text);
}

function writeDigits(
  minorUnits: number,
  decimals: number,
  { group, decimal }: Pick<Convention, "group" | "decimal">,
): string {
  if (!Number.isSafeInteger(minorUnits))
    throw new Error(`Not an amount in minor units: ${minorUnits}`);
  const digits = String(minorUnits).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals);
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, group);
  return fraction ? `${grouped}${decimal}${fraction}` : grouped;
}

// The symbol comes from the user's language rather than the format, so choosing how numbers look
// never turns US$ into $US or € into EUR.
function currencySymbol(code: string, language: string): string {
  const parts = new Intl.NumberFormat(language, {
    style: "currency",
    currency: code,
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? code;
}

function endsInLetter(symbol: string): boolean {
  return /\p{L}$/u.test(symbol);
}

const noBreakSpace = "\u00A0";

// No-break spaces throughout, so an amount never wraps across lines. Grouping by space uses the
// narrow one, as French typesetting does.
const conventions: Record<NumberFormat, Convention> = {
  comma_period: { group: ",", decimal: ".", placement: "before" },
  period_comma: { group: ".", decimal: ",", placement: "before, spaced" },
  space_comma: { group: "\u202F", decimal: ",", placement: "after" },
  apostrophe_period: { group: "'", decimal: ".", placement: "before, spaced" },
};

const anyGroupingMark = /[\s'’.,]/g;

type Convention = {
  group: string;
  decimal: string;
  placement: "before" | "before, spaced" | "after";
};

export type Currency = { code: string; decimals: number };
export type NumberFormat = Enums<"number_format">;
export type DateFormat = Enums<"date_format">;

export const numberFormats = Constants.public.Enums.number_format;
export const dateFormats = Constants.public.Enums.date_format;
