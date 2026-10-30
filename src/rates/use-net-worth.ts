import { useAccounts } from "../accounts/account-queries";
import { useCounterparties } from "../counterparties/counterparty-queries";
import { openDebts } from "../counterparties/owed";
import type { Currency } from "../format/format";
import { useCurrencies, useDisplayCurrency } from "../money/currency-queries";
import { inSpaces } from "../spaces/space";
import type { Space } from "../spaces/space-queries";
import type { LatestRate } from "./convert";
import { type NamedBalance, netWorth } from "./net-worth";
import { useLatestRates } from "./rate-queries";

// Undefined until everything it needs has loaded.
export function useNetWorthToday(
  spaces: readonly Pick<Space, "id">[] | undefined,
): NetWorthToday | undefined {
  const { data: accounts } = useAccounts();
  const { data: counterparties } = useCounterparties();
  const { data: currencies } = useCurrencies();
  const { data: rates } = useLatestRates();
  const currency = useDisplayCurrency();
  if (!accounts || !counterparties || !currencies || !rates || !currency || !spaces) {
    return undefined;
  }

  const worth = (balances: NamedBalance[]) => netWorth(balances, currencies, currency, rates);
  const ofAccounts = worth(inSpaces(accounts, spaces));
  const debts = openDebts(inSpaces(counterparties, spaces));
  const ofDebts = debts.length > 0 ? worth(debts) : null;
  return {
    currency,
    total: ofAccounts.total,
    afterDebts: ofDebts ? ofAccounts.total + ofDebts.total : null,
    accountsWithoutRate: ofAccounts.withoutRate,
    debtsWithoutRate: ofDebts?.withoutRate ?? [],
    staleRates: oneEach([...ofAccounts.staleRates, ...(ofDebts?.staleRates ?? [])]),
  };
}

function oneEach(rates: LatestRate[]): LatestRate[] {
  return [...new Map(rates.map((rate) => [rate.currency, rate])).values()];
}

export type NetWorthToday = {
  currency: Currency;
  total: number;
  // Null while nothing is owed either way.
  afterDebts: number | null;
  accountsWithoutRate: NamedBalance[];
  // Above zero while the counterparty owes the space.
  debtsWithoutRate: NamedBalance[];
  staleRates: LatestRate[];
};
