import { daysAfter } from "../format/days";
import { nthDate, type Repeat } from "../recurring/schedule";

// From the first period to the one holding `today`, or just the first if it hasn't started. Each
// limit carries over from how the period before ended, so a carry-over keeps adding up.
export function budgetPeriods(
  plan: BudgetPlan,
  spending: DaySpending[],
  today: string,
): PeriodProgress[] {
  let carried = 0;
  return periodsUpTo(plan, today).map((period) => {
    const limit = plan.limit + carried;
    const spent = spentWithin(spending, period);
    carried = carryOver(plan, limit - spent);
    return { ...period, limit, spent };
  });
}

function periodsUpTo({ startsOn, length }: BudgetPlan, today: string): Period[] {
  switch (length.kind) {
    case "fixed":
      return [{ start: startsOn, end: length.endsOn }];
    case "repeating": {
      const nth = (n: number) => nthDate({ startsOn, ...length }, n);
      const periodAt = (n: number) => ({ start: nth(n), end: daysAfter(nth(n + 1), -1) });
      const periods = [periodAt(0)];
      while (nth(periods.length) <= today) periods.push(periodAt(periods.length));
      return periods;
    }
  }
}

function spentWithin(spending: DaySpending[], { start, end }: Period): number {
  return spending
    .filter(({ day }) => day >= start && day <= end)
    .reduce((total, { amount }) => total + amount, 0);
}

function carryOver({ carryUnspent, carryOverspent }: BudgetPlan, left: number): number {
  if (left > 0) return carryUnspent ? left : 0;
  return carryOverspent ? left : 0;
}

export function currentPeriod(
  periods: PeriodProgress[],
  today: string,
): PeriodProgress | undefined {
  return periods.find(({ start, end }) => start <= today && today <= end);
}

// What can go each day left, today included, to end the period having spent exactly its limit.
// Rounded down, so the last day isn't promised money that isn't there.
export function dailyAllowance(period: PeriodProgress, today: string): Allowance | null {
  if (today < period.start || today > period.end) return null;
  const daysLeft = daysBetween(today, period.end) + 1;
  const left = period.limit - period.spent;
  if (left < 0) return { kind: "over", daysLeft };
  return { kind: "per-day", amount: Math.floor(left / daysLeft), daysLeft };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000));
}

export type BudgetPlan = {
  // Each period's, before carry-over.
  limit: number;
  startsOn: string;
  length: (Repeat & { kind: "repeating" }) | FixedLength;
  carryUnspent: boolean;
  carryOverspent: boolean;
};

type FixedLength = { kind: "fixed"; endsOn: string };

// In the budget's currency, net of refunds.
export type DaySpending = { day: string; amount: number };

type Period = { start: string; end: string };

export type PeriodProgress = Period & { limit: number; spent: number };

export type Allowance =
  { kind: "per-day"; amount: number; daysLeft: number } | { kind: "over"; daysLeft: number };
