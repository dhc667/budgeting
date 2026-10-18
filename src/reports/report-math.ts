import { daysAfter, type DateRange } from "../format/days";
import { groupBy } from "../group-by";
import {
  convertAtDay,
  type DisplayConversion,
  earliestMissing,
  type MissingRate,
} from "../rates/convert-dated";
import { monthKey } from "./periods";
import type { AccountMovement, CategoryFlow } from "./read-reports";

export function spendingByCategory(
  flows: readonly CategoryFlow[],
  { from, to }: DateRange,
  conversion: DisplayConversion,
): SpendingReport {
  const missing: MissingRate[] = [];
  const byCategory = new Map<string, CategorySpending>();

  for (const flow of flows) {
    if (flow.kind !== "expense" || flow.day < from || flow.day > to) continue;
    const amount = inDisplayCurrency(flow.net, flow.currency, flow.day, conversion, missing);
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

type CategorySpending = {
  categoryId: string;
  name: string;
  spaceId: string;
  amount: number;
};

export type IncomeExpenseReport = { months: MonthFlow[]; missing: MissingRate[] };

type MonthFlow = { month: string; income: number; expense: number; difference: number };

export type NetWorthSeries = { points: NetWorthPoint[]; missing: MissingRate[] };

export type NetWorthPoint = { day: string; total: number };
