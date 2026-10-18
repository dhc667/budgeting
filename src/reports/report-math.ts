import type { Color } from "../colors/colors";
import { daysAfter, type DateRange } from "../format/days";
import { groupBy } from "../group-by";
import {
  convertAtDay,
  type DisplayConversion,
  earliestMissing,
  type MissingRate,
} from "../rates/convert-dated";
import { inPeriod, monthKey } from "./periods";
import type { AccountMovement, CategoryFlow } from "./read-reports";

export function spendingByCategory(
  flows: readonly CategoryFlow[],
  period: DateRange,
  conversion: DisplayConversion,
): SpendingReport {
  const missing: MissingRate[] = [];
  const byCategory = new Map<string, Omit<CategorySpending, "share">>();

  for (const flow of flows) {
    if (flow.kind !== "expense" || !inPeriod(flow.day, period)) continue;
    const amount = inDisplayCurrency(flow.net, flow.currency, flow.day, conversion, missing);
    if (amount === undefined) continue;
    const spending = byCategory.get(flow.categoryId) ?? {
      categoryId: flow.categoryId,
      name: flow.categoryName,
      icon: flow.categoryIcon,
      color: flow.categoryColor,
      spaceId: flow.spaceId,
      amount: 0,
    };
    spending.amount += amount;
    byCategory.set(flow.categoryId, spending);
  }

  const sorted = [...byCategory.values()].sort(
    (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
  );
  const spent = sorted.reduce((sum, { amount }) => sum + Math.max(amount, 0), 0);
  return {
    total: sorted.reduce((sum, { amount }) => sum + amount, 0),
    categories: sorted.map((category) => ({
      ...category,
      share: spent > 0 ? Math.max(category.amount, 0) / spent : 0,
    })),
    missing: earliestMissing(missing),
  };
}

export function incomeVsExpense(
  flows: readonly CategoryFlow[],
  months: readonly string[],
  conversion: DisplayConversion,
): IncomeExpenseReport {
  const missing: MissingRate[] = [];
  const totals = new Map<string, { income: number; expense: number }>(
    months.map((month) => [month, { income: 0, expense: 0 }]),
  );

  for (const flow of flows) {
    const total = totals.get(monthKey(flow.day));
    if (!total) continue;
    const amount = inDisplayCurrency(flow.net, flow.currency, flow.day, conversion, missing);
    if (amount !== undefined) total[flow.kind] += amount;
  }

  return {
    months: months.map((month) => {
      const { income = 0, expense = 0 } = totals.get(month) ?? {};
      return { month, income, expense, difference: income - expense };
    }),
    missing: earliestMissing(missing),
  };
}

// One point per day from the first movement to `today`, each the balances at the end of that day
// converted at that day's rates. An account is left out of the days before its currency's first
// rate. Movements dated after today count in today's point, as balances everywhere else include
// them.
export function netWorthSeries(
  movements: readonly AccountMovement[],
  today: string,
  conversion: DisplayConversion,
): NetWorthSeries {
  const missing: MissingRate[] = [];
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
      total += inDisplayCurrency(balance, currency, day, conversion, missing) ?? 0;
    }
    points.push({ day, total });
  }
  return { points, missing: earliestMissing(missing) };
}

function inDisplayCurrency(
  minorUnits: number,
  currency: string,
  day: string,
  conversion: DisplayConversion,
  missing: MissingRate[],
): number | undefined {
  const converted = convertAtDay(minorUnits, currency, day, conversion);
  switch (converted.kind) {
    case "converted":
      return converted.minorUnits;
    case "missing":
      missing.push(converted.missing);
      return undefined;
  }
}

export type SpendingReport = {
  total: number;
  categories: CategorySpending[];
  missing: MissingRate[];
};

export type CategorySpending = {
  categoryId: string;
  name: string;
  icon: string;
  color: Color;
  spaceId: string;
  amount: number;
  // Of what the categories that spent anything spent, so the shares add up to 1. A category
  // refunded more than it spent takes none.
  share: number;
};

export type IncomeExpenseReport = { months: MonthFlow[]; missing: MissingRate[] };

type MonthFlow = { month: string; income: number; expense: number; difference: number };

export type NetWorthSeries = { points: NetWorthPoint[]; missing: MissingRate[] };

export type NetWorthPoint = { day: string; total: number };
