import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useCopyQuery } from "../sync/copy-query";
import type { MissingRate } from "./convert-dated";
import { readLatestRates } from "./read-latest-rates";
import { readRateHistory } from "./read-rate-history";

export function useLatestRates() {
  return useCopyQuery(["latest-rates"], ({ rows }) => readLatestRates(rows));
}

// The rates needed to convert amounts dated as given into `displayCurrency`.
export function useRateHistory(
  displayCurrency: string,
  dated: readonly { currency: string; day: string }[],
) {
  const { codes, firstDay } = useMemo(
    () => ({
      codes: [...new Set([displayCurrency, ...dated.map(({ currency }) => currency)])]
        .filter((code) => code !== "USD")
        .sort(),
      firstDay: dated.map(({ day }) => day).sort()[0],
    }),
    [displayCurrency, dated],
  );
  return useCopyQuery(["rate-history", codes, firstDay], ({ rows }) =>
    readRateHistory(rows, codes, firstDay),
  );
}

// The daily sync fetches rates back to the oldest transaction, but only once a day: one dated
// before every other, recorded since, waits until tomorrow unless asked now. Asked once per day and
// currency, as a provider without that history would otherwise be asked on every render.
export function useBackfillMissingRates(missing: readonly MissingRate[]) {
  const queryClient = useQueryClient();
  const asked = missing
    .map(({ currency, day }) => `${currency} ${day}`)
    .filter((key) => !askedFor(queryClient).has(key));
  const key = asked.join(",");
  useEffect(() => {
    if (key === "") return;
    for (const each of key.split(",")) askedFor(queryClient).add(each);
    void queryClient.invalidateQueries(
      { queryKey: ["exchange-rates-sync"] },
      { cancelRefetch: false },
    );
  }, [key, queryClient]);
}

function askedFor(queryClient: QueryClient): Set<string> {
  let asked = askedByClient.get(queryClient);
  if (!asked) {
    asked = new Set();
    askedByClient.set(queryClient, asked);
  }
  return asked;
}

const askedByClient = new WeakMap<QueryClient, Set<string>>();
