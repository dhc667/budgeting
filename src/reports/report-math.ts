import { daysAfter, type DateRange } from "../format/days";
import { groupBy } from "../group-by";
import {
  convertAtDay,
  type DisplayConversion,
  earliestMissing,
  type MissingRate,
} from "../rates/convert-dated";
import { inPeriod, monthKey } from "./periods";
import type { CategoryFlow, FlowCategory, Movement } from "./read-reports";

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
  const sliced = totals.flatMap(({ own, subcategories, ...category }) => [
    { ...category, amount: own },
    ...subcategories.values(),
  ]);
  const ofSlices = spent(sliced);
  const ofCategories = spent(totals);

  return {
    total: totals.reduce((sum, { amount }) => sum + amount, 0),
    categories: totals.map(({ own, subcategories, ...category }) => ({
      ...withShare(category, ofCategories),
      subcategories: slices([...subcategories.values()], ofSlices),
    })),
    subcategorySlices: slices(sliced, ofSlices),
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
// converted at that day's rates, without debts and with them. A balance is left out of the days
// before its currency's first rate. Movements dated after today count in today's point, as
// balances everywhere else include them.
export function netWorthSeries(
  movements: readonly Movement[],
  today: string,
  conversion: DisplayConversion,
): NetWorthSeries {
  const missing: MissingRate[] = [];
  const byDay = groupBy(movements, ({ day }) => (day > today ? today : day));
  const first = [...byDay.keys()].sort()[0];
  if (first === undefined) return { points: [], missing: [], hasDebts: false };

  const balances = new Map<string, Pick<Movement, "holding" | "currency"> & { balance: number }>();
  const points: NetWorthPoint[] = [];
  for (let day = first; day <= today; day = daysAfter(day, 1)) {
    for (const { ledgerId, holding, currency, amount } of byDay.get(day) ?? []) {
      const key = JSON.stringify([ledgerId, currency]);
      const held = balances.get(key) ?? { holding, currency, balance: 0 };
      held.balance += amount;
      balances.set(key, held);
    }
    const point = { day, total: 0, afterDebts: 0 };
    for (const { holding, currency, balance } of balances.values()) {
      if (balance === 0) continue;
      const converted = inDisplayCurrency(balance, currency, day, conversion, missing) ?? 0;
      point.afterDebts += converted;
      switch (holding) {
        case "account":
          point.total += converted;
          break;
        case "debt":
          break;
      }
    }
    points.push(point);
  }
  const hasDebts = movements.some(({ holding }) => holding === "debt");
  return { points, missing: earliestMissing(missing), hasDebts };
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
  // Each subcategory, and what each category took outside its subcategories, biggest first
  // whatever their category. That last carries the category's own id.
  subcategorySlices: CategoryAmount[];
  missing: MissingRate[];
};

export type CategoryTotal = CategoryAmount & { subcategories: CategoryAmount[] };

export type CategoryAmount = FlowCategory & { amount: number; share: number };

type Amount = FlowCategory & { amount: number };

type Totaling = Amount & { own: number; subcategories: Map<string, Amount> };

export type IncomeExpenseReport = { months: MonthFlow[]; missing: MissingRate[] };

type MonthFlow = { month: string; income: number; expense: number; difference: number };

export type NetWorthSeries = { points: NetWorthPoint[]; missing: MissingRate[]; hasDebts: boolean };

export type NetWorthPoint = { day: string; total: number; afterDebts: number };
