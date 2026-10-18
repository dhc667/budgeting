import type { Currency } from "../format/format";
import type { Rows } from "../sync/copy";

export function readCurrencies({ currencies }: Pick<Rows, "currencies">): Currency[] {
  return [...currencies.values()]
    .map(({ code, decimals }) => ({ code, decimals }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
