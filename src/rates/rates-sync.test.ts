import { describe, expect, it } from "vitest";
import { missingRanges } from "./rates-sync";

describe("missingRanges", () => {
  it("asks for nothing when the stored rates reach the newest and the oldest transaction", () => {
    expect(
      missingRanges({ from: "2026-01-01", to: "2026-10-16" }, "2026-10-16", "2026-03-05"),
    ).toEqual([]);
  });

  it("asks for the days after the last stored one, up to the newest", () => {
    expect(missingRanges({ from: "2026-01-01", to: "2026-10-10" }, "2026-10-16", null)).toEqual([
      { from: "2026-10-11", to: "2026-10-16" },
    ]);
  });

  it("asks for the days before the first stored one, from the oldest transaction", () => {
    expect(
      missingRanges({ from: "2026-10-16", to: "2026-10-16" }, "2026-10-16", "2026-08-30"),
    ).toEqual([{ from: "2026-08-30", to: "2026-10-15" }]);
  });

  it("asks for both ends at once, one range each", () => {
    expect(
      missingRanges({ from: "2026-09-01", to: "2026-10-01" }, "2026-10-16", "2026-02-27"),
    ).toEqual([
      { from: "2026-10-02", to: "2026-10-16" },
      { from: "2026-02-27", to: "2026-08-31" },
    ]);
  });

  it("looks back from the newest rates when none are stored", () => {
    expect(missingRanges(null, "2026-10-16", "2026-10-01")).toEqual([
      { from: "2026-10-01", to: "2026-10-15" },
    ]);
    expect(missingRanges(null, "2026-10-16", null)).toEqual([]);
  });

  it("steps over month and year ends", () => {
    expect(
      missingRanges({ from: "2026-03-01", to: "2026-12-31" }, "2027-01-02", "2026-02-10"),
    ).toEqual([
      { from: "2027-01-01", to: "2027-01-02" },
      { from: "2026-02-10", to: "2026-02-28" },
    ]);
  });
});
