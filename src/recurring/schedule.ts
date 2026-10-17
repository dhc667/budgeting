// `done` counts the occurrences already recorded or skipped. Each is counted from the start date
// rather than from the one before, so a rule on the 31st comes back to it after a shorter month.
export function nextDueDate(schedule: Schedule, done: number): string | null {
  if (schedule.times !== null && done >= schedule.times) return null;
  const start = new Date(`${schedule.startsOn}T00:00:00Z`);
  const due = after(start, done * schedule.every, schedule.unit)
    .toISOString()
    .slice(0, 10);
  if (schedule.endsOn !== null && due > schedule.endsOn) return null;
  return due;
}

// The occurrence to resume a paused rule at: those that fell before `day` never happened.
export function firstDueFrom(schedule: Schedule, done: number, day: string): number | null {
  for (let occurrence = done; ; occurrence++) {
    const due = nextDueDate(schedule, occurrence);
    if (due === null) return null;
    if (due >= day) return occurrence;
  }
}

function after(date: Date, steps: number, unit: Schedule["unit"]): Date {
  switch (unit) {
    case "day":
      return daysAfter(date, steps);
    case "week":
      return daysAfter(date, steps * 7);
    case "month":
      return monthsAfter(date, steps);
    case "year":
      return monthsAfter(date, steps * 12);
  }
}

function daysAfter(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function monthsAfter(date: Date, months: number): Date {
  const firstOfMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
  const month = new Date(firstOfMonth);
  const lastDay = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  month.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return month;
}

export const units = ["day", "week", "month", "year"] as const;

export type Schedule = {
  startsOn: string;
  every: number;
  unit: (typeof units)[number];
  endsOn: string | null;
  times: number | null;
};
