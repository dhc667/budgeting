import type { Currency } from "../format/format";
import { convert, type LatestRate, type LatestRates } from "./convert";

export function netWorth(
  balances: NamedBalance[],
  currencies: readonly Currency[],
  displayCurrency: Currency,
  rates: LatestRates,
): NetWorth {
  let total = 0;
  const withoutRate: NamedBalance[] = [];
  const staleRates = new Map<string, LatestRate>();

  for (const named of balances) {
    const currency = currencies.find(({ code }) => code === named.currency);
    if (!currency || named.balance === 0) continue;
    const converted = convert(named.balance, currency, displayCurrency, rates);
    switch (converted.kind) {
      case "converted":
        total += converted.minorUnits;
        for (const rate of converted.staleRates) staleRates.set(rate.currency, rate);
        break;
      case "no-rate":
        withoutRate.push(named);
        break;
    }
  }

  return { total, withoutRate, staleRates: [...staleRates.values()] };
}

export type NamedBalance = { name: string; currency: string; balance: number };

export type NetWorth = {
  total: number;
  withoutRate: NamedBalance[];
  staleRates: LatestRate[];
};
