import type { TFunction } from "i18next";
import type { DebtType } from "../transactions/transaction-tabs";
import type { NamedBalance } from "../rates/net-worth";
import type { Counterparty, CounterpartyBalance } from "./read-counterparties";

type Money = (minorUnits: number, currency: string) => string;

// One currency's balance, from the user's side.
export function owedPhrase(
  { owed, currency }: Pick<CounterpartyBalance, "owed" | "currency">,
  money: Money,
  t: TFunction,
) {
  if (owed > 0) return t("counterparties.owesYou", { amount: money(owed, currency) });
  if (owed < 0) return t("counterparties.youOwe", { amount: money(-owed, currency) });
  return t("counterparties.settledIn", { currency });
}

export function openBalances(balances: CounterpartyBalance[]): CounterpartyBalance[] {
  return balances.filter(({ owed }) => owed !== 0);
}

// Each currency a counterparty and its space still owe each other in, as a balance of the space's:
// above zero while the counterparty owes it.
export function openDebts(counterparties: readonly Counterparty[]): NamedBalance[] {
  return counterparties.flatMap(({ name, balances }) =>
    openBalances(balances).map(({ currency, owed }) => ({ name, currency, balance: owed })),
  );
}

export function owedClass(owed: number): string {
  if (owed < 0) return "text-amber-700 dark:text-amber-400";
  if (owed > 0) return "text-emerald-700 dark:text-emerald-400";
  return "text-zinc-500";
}

// All that's owed in a currency, if a debt of that type pays it off: paying back or being paid
// back, or forgiving either way. Null if it would add to the debt instead, or nothing is owed.
export function wholeDebtSettledBy(debt: DebtType, owed: number): number | null {
  switch (debt) {
    case "received":
    case "forgave":
      return owed > 0 ? owed : null;
    case "given":
    case "forgiven":
      return owed < 0 ? -owed : null;
  }
}
