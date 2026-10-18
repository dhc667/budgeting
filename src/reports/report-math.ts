import { daysAfter } from "../format/days";
import type { Currency } from "../format/format";
import { groupBy } from "../group-by";
import { convertOn, type RateHistory } from "../rates/convert";
import type { AccountMovement, CategoryFlow } from "./read-reports";
import { monthKey, type Period } from "./periods";

export type Display = {
  currencies: readonly Currency[];
  currency: Currency;
  history: RateHistory;
};

// The first day each currency lacked a rate on, which is where backfilling has to reach.
export type MissingRate = { currency: string; day: string };

export type CategorySpending = {
  categoryId: string;
  name: string;
  spaceId: string;
  amount: number;
};

export function spendingByCategory(
  flows: readonly CategoryFlow[],
  { from, to }: Period,
  display: Display,
): { total: number; categories: CategorySpending[]; missing: MissingRate[] } {
  const missing = new Missing();
  const byCategory = new Map<string, CategorySpending>();

  for (const flow of flows) {
    if (flow.kind !== "expense" || flow.day < from || flow.day > to) continue;
    const amount = toDisplay(flow.net, flow.currency, flow.day, display, missing);
    if (amount === undefined) continue;
    const spending = byCategory.get(flow.categoryId) ?? {
      categoryId: flow.categoryId,
      name: flow.categoryName,
      spaceId: flow.spaceId,
      amount: 0,
    };
    spending.amount += amount;
    byCategory.set(flow.categoryId, spending);
  }

  const categories = [...byCategory.values()].sort(
    (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
  );
  return {
    total: categories.reduce((sum, { amount }) => sum + amount, 0),
    categories,
    missing: missing.list(),
  };
}

export type MonthFlow = { month: string; income: number; expense: number; difference: number };

export function incomeVsExpense(
  flows: readonly CategoryFlow[],
  months: readonly string[],
  display: Display,
): { months: MonthFlow[]; missing: MissingRate[] } {
  const missing = new Missing();
  const totals = new Map<string, { income: number; expense: number }>(
    months.map((month) => [month, { income: 0, expense: 0 }]),
  );

  for (const flow of flows) {
    const total = totals.get(monthKey(flow.day));
    if (!total) continue;
    const amount = toDisplay(flow.net, flow.currency, flow.day, display, missing);
    if (amount !== undefined) total[flow.kind] += amount;
  }

  return {
    months: months.map((month) => {
      const { income = 0, expense = 0 } = totals.get(month) ?? {};
      return { month, income, expense, difference: income - expense };
    }),
    missing: missing.list(),
  };
}

export type NetWorthPoint = { day: string; total: number };

// One point per day from the first movement to `today`, each the balances at the end of that day
// converted at that day's rates. Movements dated after today count in today's point, as balances
// everywhere else include them.
export function netWorthSeries(
  movements: readonly AccountMovement[],
  today: string,
  display: Display,
): { points: NetWorthPoint[]; missing: MissingRate[] } {
  const missing = new Missing();
  const byDay = groupBy(movements, ({ day }) => (day > today ? today : day));
  const first = [...byDay.keys()].sort()[0];
  if (first === undefined) return { points: [], missing: [] };

  const balances = new Map<string, { currency: string; balance: number }>();
  const points: NetWorthPoint[] = [];
  for (let day = first; day <= today; day = daysAfter(day, 1)) {
    for (const { accountId, currency, amount } of byDay.get(day) ?? []) {
      const account = balances.get(accountId) ?? { currency, balance: 0 };
      account.balance += amount;
      balances.set(accountId, account);
    }
    let total = 0;
    for (const { currency, balance } of balances.values()) {
      if (balance === 0) continue;
      total += toDisplay(balance, currency, day, display, missing) ?? 0;
    }
    points.push({ day, total });
  }
  return { points, missing: missing.list() };
}

function toDisplay(
  minorUnits: number,
  code: string,
  day: string,
  { currencies, currency: display, history }: Display,
  missing: Missing,
): number | undefined {
  const from = currencies.find((candidate) => candidate.code === code);
  const converted = from ? convertOn(minorUnits, from, display, day, history) : undefined;
  switch (converted?.kind) {
    case "converted":
      return converted.minorUnits;
    case "no-rate":
      missing.note(converted.currency, day);
      return undefined;
    case undefined:
      missing.note(code, day);
      return undefined;
  }
}

class Missing {
  private readonly firstDays = new Map<string, string>();

  note(currency: string, day: string) {
    const known = this.firstDays.get(currency);
    if (known === undefined || day < known) this.firstDays.set(currency, day);
  }

  list(): MissingRate[] {
    return [...this.firstDays]
      .map(([currency, day]) => ({ currency, day }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }
}
