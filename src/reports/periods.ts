import { type DateRange, daysAfter } from "../format/days";

export function thisMonth(today: string): DateRange {
  return monthOf(monthKey(today));
}

export function lastMonth(today: string): DateRange {
  return monthOf(monthKey(daysAfter(firstDayOf(monthKey(today)), -1)));
}

export function thisYear(today: string): DateRange {
  const year = today.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export const allTime: DateRange = { from: "", to: "" };

// An empty bound leaves its side open, as clearing a date field does.
export function inPeriod(day: string, { from, to }: DateRange): boolean {
  return (from === "" || day >= from) && (to === "" || day <= to);
}

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

// Oldest first, ending with the month of `today`.
export function lastMonths(count: number, today: string): string[] {
  const months: string[] = [];
  let month = monthKey(today);
  for (let taken = 0; taken < count; taken++) {
    months.unshift(month);
    month = monthKey(daysAfter(firstDayOf(month), -1));
  }
  return months;
}

export function firstDayOf(month: string): string {
  return `${month}-01`;
}

function monthOf(month: string): DateRange {
  const from = firstDayOf(month);
  const nextMonth = monthKey(daysAfter(from, 31));
  return { from, to: daysAfter(firstDayOf(nextMonth), -1) };
}
