import type { Currency } from "../format/format";
import { convert, type LatestRate, type LatestRates } from "./convert";

export function netWorth(
  accounts: NetWorthAccount[],
  currencies: Currency[],
  displayCurrency: Currency,
  rates: LatestRates,
): NetWorth {
  let total = 0;
  const withoutRate: NetWorthAccount[] = [];
  const staleRates = new Map<string, LatestRate>();

  for (const account of accounts) {
    const currency = currencies.find(({ code }) => code === account.currency);
    if (!currency || account.balance === 0) continue;
    const converted = convert(account.balance, currency, displayCurrency, rates);
    switch (converted.kind) {
      case "converted":
        total += converted.minorUnits;
        for (const rate of converted.staleRates) staleRates.set(rate.currency, rate);
        break;
      case "no-rate":
        withoutRate.push(account);
        break;
    }
  }

  return { total, withoutRate, staleRates: [...staleRates.values()] };
}

export type NetWorthAccount = { name: string; currency: string; balance: number };

export type NetWorth = {
  total: number;
  withoutRate: NetWorthAccount[];
  staleRates: LatestRate[];
};
