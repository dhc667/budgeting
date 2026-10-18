import { daysAfter, type DateRange } from "../format/days";
import { groupBy } from "../group-by";
import {
  convertAtDay,
  type DisplayConversion,
  earliestMissing,
  type MissingRate,
} from "../rates/convert-dated";
import { inPeriod, monthKey } from "./periods";
import type { AccountMovement, CategoryFlow, FlowCategory } from "./read-reports";

export function categoryTotals(
  flows: readonly CategoryFlow[],
  kind: CategoryFlow["kind"],
  period: DateRange,
  conversion: DisplayConversion,
): CategoryReport {
  const missing: MissingRate[] = [];
  const totals = new Map<string, Totaling>();

  for (const flow of flows) {
    if (flow.kind !== kind || !inPeriod(flow.day, period)) continue;
    const amount = inDisplayCurrency(flow.net, flow.currency, flow.day, conversion, missing);
    if (amount === undefined) continue;
    const total = totals.get(flow.category.id) ?? {
      ...flow.category,
      amount: 0,
      own: 0,
      subcategories: new Map<string, Amount>(),
    };
    total.amount += amount;
    if (flow.subcategory === null) {
      total.own += amount;
    } else {
      const subcategory = total.subcategories.get(flow.subcategory.id) ?? {
        ...flow.subcategory,
        amount: 0,
      };
      subcategory.amount += amount;
      total.subcategories.set(flow.subcategory.id, subcategory);
    }
    totals.set(flow.category.id, total);
  }

  return report([...totals.values()].sort(biggestFirst), earliestMissing(missing));
}

function report(totals: readonly Totaling[], missing: MissingRate[]): CategoryReport {
  const sliced = totals.map(({ own, subcategories, ...category }) => [
    { ...category, amount: own },
    ...subcategories.values(),
  ]);
  const ofSlices = spent(sliced.flat());
  const ofCategories = spent(totals);

  return {
    total: totals.reduce((sum, { amount }) => sum + amount, 0),
    categories: totals.map(({ own, subcategories, ...category }) => ({
      ...withShare(category, ofCategories),
      subcategories: slices([...subcategories.values()], ofSlices),
    })),
    subcategorySlices: sliced.flatMap((amounts) => slices(amounts, ofSlices)),
    missing,
  };
}

function slices(amounts: readonly Amount[], of: number): CategoryAmount[] {
  return amounts
    .filter(({ amount }) => amount !== 0)
    .sort(biggestFirst)
    .map((amount) => withShare(amount, of));
}

function withShare<T extends Amount>(amount: T, of: number): T & { share: number } {
  return { ...amount, share: of > 0 ? Math.max(amount.amount, 0) / of : 0 };
}

// Only what was spent counts, so the shares add up to 1. A category refunded more than it spent
// takes none.
function spent(amounts: readonly Amount[]): number {
  return amounts.reduce((sum, { amount }) => sum + Math.max(amount, 0), 0);
}

function biggestFirst(a: Amount, b: Amount): number {
  return b.amount - a.amount || a.name.localeCompare(b.name);
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

export type CategoryReport = {
  total: number;
  // Top-level, biggest first.
  categories: CategoryTotal[];
  // Each subcategory, and what each category took outside its subcategories, grouped by category
  // in the order of `categories`. That last carries the category's own id.
  subcategorySlices: CategoryAmount[];
  missing: MissingRate[];
};

export type CategoryTotal = CategoryAmount & { subcategories: CategoryAmount[] };

export type CategoryAmount = FlowCategory & { amount: number; share: number };

type Amount = FlowCategory & { amount: number };

type Totaling = Amount & { own: number; subcategories: Map<string, Amount> };

export type IncomeExpenseReport = { months: MonthFlow[]; missing: MissingRate[] };

type MonthFlow = { month: string; income: number; expense: number; difference: number };

export type NetWorthSeries = { points: NetWorthPoint[]; missing: MissingRate[] };

export type NetWorthPoint = { day: string; total: number };
