import { useCopyQuery } from "../sync/copy-query";
import { readCurrencies } from "./read-currencies";

export function useCurrencies() {
  return useCopyQuery(["currencies"], ({ rows }) => readCurrencies(rows));
}
