// Days travel as ISO dates (`2026-10-15`), as Postgres stores them, and are read in local time:
// `new Date("2026-10-15")` would be midnight UTC, the day before west of Greenwich.
export function localToday(): string {
  return dayOf(new Date());
}

export function daysAfter(day: string, days: number): string {
  const date = dayToDate(day);
  date.setDate(date.getDate() + days);
  return dayOf(date);
}

export function dayToDate(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function dayOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export type DateRange = { from: string; to: string };
