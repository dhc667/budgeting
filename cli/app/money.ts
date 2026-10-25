import { fail } from "../fail.ts";

// Typed in whole units of their currency, as people write them: 3477.23, or 1250 for 1250.00.
// Stored in minor units (ADR 0010).
export function parseAmount(
  text: string,
  flag: string,
  currency: { code: string; decimals: number },
  { signed = false } = {},
): number {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (!signed && match[1] === "-")) {
    fail(`${flag} must be an amount in ${currency.code}, like ${example(currency.decimals)}.`);
  }
  const [, sign = "", whole = "", fraction = ""] = match;
  if (fraction.length > currency.decimals) {
    fail(`${flag}: ${currency.code} has ${currency.decimals} decimals, and ${text} has more.`);
  }
  const minorUnits = Number(`${whole}${fraction.padEnd(currency.decimals, "0")}`);
  if (!Number.isSafeInteger(minorUnits)) fail(`${flag}: ${text} is more than an amount can be.`);
  if (!signed && minorUnits === 0) fail(`${flag} must be above zero.`);
  return sign === "-" && minorUnits !== 0 ? -minorUnits : minorUnits;
}

export function wholeUnits(minorUnits: number, decimals: number): number {
  return minorUnits / 10 ** decimals;
}

export function formatAmount(minorUnits: number, currency: string, decimals: number): string {
  const digits = String(Math.abs(minorUnits)).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? `.${digits.slice(-decimals)}` : "";
  return `${minorUnits < 0 ? "-" : ""}${whole}${fraction} ${currency}`;
}

function example(decimals: number): string {
  return decimals > 0 ? `12.${"5".padEnd(decimals, "0")}` : "1250";
}
