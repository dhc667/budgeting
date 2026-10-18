import type { Currency } from "../format/format";
import { useCopyQuery } from "../sync/copy-query";

export function useCurrencies() {
  return useCopyQuery(["currencies"], ({ rows }): Currency[] =>
    [...rows.currencies.values()]
      .map(({ code, decimals }) => ({ code, decimals }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  );
}
