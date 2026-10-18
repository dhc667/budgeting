import { describe, expect, it } from "vitest";
import { lastMonth, lastMonths, thisMonth, thisYear } from "./periods";

describe("report periods", () => {
  it("runs this month from its first day to its last", () => {
    expect(thisMonth("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(thisMonth("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("runs last month across a year boundary", () => {
    expect(lastMonth("2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("runs this year from January to December", () => {
    expect(thisYear("2026-10-18")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("lists the last months oldest first, ending with the current one", () => {
    expect(lastMonths(4, "2026-02-10")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
