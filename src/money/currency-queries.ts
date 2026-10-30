import { useProfile } from "../profile/profile-queries";
import { useCopyQuery } from "../sync/copy-query";
import { readCurrencies } from "./read-currencies";

export function useCurrencies() {
  return useCopyQuery(["currencies"], ({ rows }) => readCurrencies(rows));
}

// Undefined until the profile and currencies have loaded.
export function useDisplayCurrency() {
  const { data: currencies } = useCurrencies();
  const { data: profile } = useProfile();
  return currencies?.find(({ code }) => code === profile?.display_currency);
}
