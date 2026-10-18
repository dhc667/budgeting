import type { Rows } from "../sync/copy";
import { ratesByCurrency } from "../sync/lookups";
import type { RateHistory } from "./convert";

// Each currency's rates from the one in effect on `firstDay` on, as a day's rate is the latest on
// or before it. A day with no rate before it starts at the first rate after.
export function readRateHistory(
  { exchange_rates }: Pick<Rows, "exchange_rates">,
  currencies: readonly string[],
  firstDay: string | undefined,
): RateHistory {
  if (firstDay === undefined) return new Map();
  const byCurrency = ratesByCurrency(exchange_rates);
  return new Map(
    currencies.map((code) => {
      const dated = byCurrency.get(code) ?? [];
      const inEffect = dated.findLastIndex(({ date }) => date <= firstDay);
      return [code, dated.slice(Math.max(inEffect, 0)).map(({ date, rate }) => ({ date, rate }))];
    }),
  );
}
