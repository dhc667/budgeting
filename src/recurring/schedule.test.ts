import { describe, expect, it } from "vitest";
import { nextDueDate, type Schedule } from "./schedule";

function schedule(overrides: Partial<Schedule>): Schedule {
  return {
    startsOn: "2026-01-15",
    every: 1,
    unit: "month",
    endsOn: null,
    times: null,
    ...overrides,
  };
}

describe("the next due date", () => {
  it("is the start date until one is recorded or skipped", () => {
    expect(nextDueDate(schedule({}), 0)).toBe("2026-01-15");
  });

  it("moves on a month for each one done", () => {
    expect(nextDueDate(schedule({}), 2)).toBe("2026-03-15");
  });

  it("falls on the last day of a month too short for its day, then comes back to it", () => {
    const monthEnd = schedule({ startsOn: "2026-01-31" });

    expect(nextDueDate(monthEnd, 1)).toBe("2026-02-28");
    expect(nextDueDate(monthEnd, 2)).toBe("2026-03-31");
    expect(nextDueDate(monthEnd, 3)).toBe("2026-04-30");
    expect(nextDueDate(schedule({ startsOn: "2028-01-31" }), 1)).toBe("2028-02-29");
  });

  it("moves on every N days or weeks, across months and years", () => {
    expect(nextDueDate(schedule({ unit: "day", every: 10, startsOn: "2026-12-25" }), 1)).toBe(
      "2027-01-04",
    );
    expect(nextDueDate(schedule({ unit: "week", every: 2, startsOn: "2026-02-20" }), 3)).toBe(
      "2026-04-03",
    );
  });

  it("keeps a yearly rule on Feb 29 to the end of February outside leap years", () => {
    const leapDay = schedule({ unit: "year", startsOn: "2028-02-29" });

    expect(nextDueDate(leapDay, 1)).toBe("2029-02-28");
    expect(nextDueDate(leapDay, 4)).toBe("2032-02-29");
  });

  it("is none once a rule has happened as many times as it was set to", () => {
    const threeTimes = schedule({ times: 3 });

    expect(nextDueDate(threeTimes, 2)).toBe("2026-03-15");
    expect(nextDueDate(threeTimes, 3)).toBeNull();
  });

  it("is none once it would fall after the end date, which may itself be due", () => {
    const untilMarch = schedule({ endsOn: "2026-03-15" });

    expect(nextDueDate(untilMarch, 2)).toBe("2026-03-15");
    expect(nextDueDate(untilMarch, 3)).toBeNull();
  });
});
