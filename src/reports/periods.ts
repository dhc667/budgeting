import { dayToDate } from "../format/days";

export type Period = { from: string; to: string };

export function thisMonth(today: string): Period {
  return monthOf(monthKey(today));
}

export function lastMonth(today: string): Period {
  const { year, month } = partsOf(today);
  return monthOf(keyOf(year, month - 1));
}

export function thisYear(today: string): Period {
  const { year } = partsOf(today);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

// "2026-10" for the month a day is in.
export function monthKey(day: string): string {
  return day.slice(0, 7);
}

// Oldest first, ending with the month of `today`.
export function lastMonths(count: number, today: string): string[] {
  const { year, month } = partsOf(today);
  return Array.from({ length: count }, (_, back) => keyOf(year, month - (count - 1 - back)));
}

export function firstDayOf(month: string): string {
  return `${month}-01`;
}

function monthOf(month: string): Period {
  const { year, month: number } = partsOf(firstDayOf(month));
  const last = new Date(year, number, 0).getDate();
  return { from: firstDayOf(month), to: `${month}-${String(last).padStart(2, "0")}` };
}

function partsOf(day: string): { year: number; month: number } {
  const date = dayToDate(day);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

// Months outside 1 to 12 roll over into the neighbouring years.
function keyOf(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
