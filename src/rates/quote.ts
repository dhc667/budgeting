import type { Currency } from "../format/format";
import { convert, type LatestRates } from "./convert";

// From the stronger currency, so it reads $1 = ¥150 rather than ¥1 = $0.01, which rounds to nothing.
export function quote(a: Currency, b: Currency, rates: LatestRates): Quote | null {
  const aInB = oneIn(a, b, rates);
  if (aInB === null) return null;
  if (aInB >= oneOf(b)) return { one: a, is: aInB, in: b };
  const bInA = oneIn(b, a, rates);
  return bInA === null ? null : { one: b, is: bInA, in: a };
}

function oneIn(from: Currency, to: Currency, rates: LatestRates): number | null {
  const converted = convert(oneOf(from), from, to, rates);
  switch (converted.kind) {
    case "converted":
      return converted.minorUnits;
    case "no-rate":
      return null;
  }
}

export function oneOf(currency: Currency): number {
  return 10 ** currency.decimals;
}

// One whole unit of `one` is worth `is` minor units of `in`.
export type Quote = { one: Currency; is: number; in: Currency };
