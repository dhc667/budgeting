import type { TFunction } from "i18next";
import type { CounterpartyBalance } from "./read-counterparties";

type Money = (minorUnits: number, currency: string) => string;

// One currency's balance, from the user's side.
export function owedPhrase({ owed, currency }: CounterpartyBalance, money: Money, t: TFunction) {
  if (owed > 0) return t("counterparties.owesYou", { amount: money(owed, currency) });
  if (owed < 0) return t("counterparties.youOwe", { amount: money(-owed, currency) });
  return t("counterparties.settledIn", { currency });
}

export function owedSummary(balances: CounterpartyBalance[], money: Money, t: TFunction): string {
  const open = balances.filter(({ owed }) => owed !== 0);
  if (open.length === 0) return t("counterparties.settled");
  return open.map((balance) => owedPhrase(balance, money, t)).join(" · ");
}

export function owedClass(balances: CounterpartyBalance[]): string {
  if (balances.some(({ owed }) => owed < 0)) return "text-amber-700 dark:text-amber-400";
  if (balances.some(({ owed }) => owed > 0)) return "text-emerald-700 dark:text-emerald-400";
  return "text-zinc-500";
}
