import { daysAfter, localToday } from "../../src/format/days.ts";

export function today(): string {
  return localToday();
}

export function daysAgo(days: number): string {
  return daysBefore(today(), days);
}

export function daysBefore(day: string, days: number): string {
  return daysAfter(day, -days);
}
