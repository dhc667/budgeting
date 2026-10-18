import { useCopyQuery } from "../sync/copy-query";
import { readLatestRates } from "./read-latest-rates";

export function useLatestRates() {
  return useCopyQuery(["latest-rates"], ({ rows }) => readLatestRates(rows));
}
