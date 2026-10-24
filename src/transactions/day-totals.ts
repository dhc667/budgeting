import {
  convertAtDay,
  type DisplayConversion,
  earliestMissing,
  type MissingRate,
} from "../rates/convert-dated";
import type { ListDay } from "./transaction-queries";

// In the display currency, at each day's rates. A day short of a rate has no total rather than a
// wrong one, and one that neither earned nor spent has none either.
export function dayTotals(days: readonly ListDay[], conversion: DisplayConversion): DayTotals {
  const totals = new Map<string, number>();
  const missing: MissingRate[] = [];
  for (const { day, flows } of days) {
    if (flows.length === 0) continue;
    let total = 0;
    let complete = true;
    for (const { currency, net } of flows) {
      const converted = convertAtDay(net, currency, day, conversion);
      switch (converted.kind) {
        case "converted":
          total += converted.minorUnits;
          break;
        case "missing":
          missing.push(converted.missing);
          complete = false;
          break;
      }
    }
    if (complete) totals.set(day, total);
  }
  return { totals, missing: earliestMissing(missing) };
}

export type DayTotals = { totals: ReadonlyMap<string, number>; missing: MissingRate[] };
