import { describe, expect, it } from "vitest";
import type { RowOf } from "../sync/copy";
import { readSpaceActivity, readSpaces } from "./read-spaces";

type Space = RowOf<"spaces">;

describe("reading spaces", () => {
  it("puts the private space first, then the others by name, each with its members", () => {
    const spaces = readSpaces({
      spaces: byId([space("s1", "Trips"), space("s2", null, "u1"), space("s3", "Family")]),
      space_members: byId([
        member("m1", "s3", "u1"),
        member("m2", "s3", "u2"),
        member("m3", "s1", "u1"),
      ]),
    });

    expect(spaces).toEqual([
      { id: "s2", name: null, private_owner: "u1", members: [] },
      {
        id: "s3",
        name: "Family",
        private_owner: null,
        members: [
          { id: "m1", user_id: "u1" },
          { id: "m2", user_id: "u2" },
        ],
      },
      { id: "s1", name: "Trips", private_owner: null, members: [{ id: "m3", user_id: "u1" }] },
    ]);
  });
});

describe("reading a space's activity", () => {
  it("has the space's entries, newest first", () => {
    const activity = readSpaceActivity(
      { activity: byId([entry(1, "s1"), entry(3, "s1"), entry(2, "s2")]) },
      "s1",
    );

    expect(activity.map(({ id }) => id)).toEqual([3, 1]);
  });
});

function space(id: string, name: string | null, private_owner: string | null = null): Space {
  return { id, name, private_owner, created_at: "2026-01-01T00:00:00+00:00", version: 1 };
}

function member(id: string, space_id: string, user_id: string) {
  return { id, space_id, user_id, created_at: "2026-01-01T00:00:00+00:00", version: 1 };
}

function entry(id: number, space_id: string): RowOf<"activity"> {
  return {
    id,
    table_name: "ledger_accounts",
    row_id: "x",
    space_id,
    action: "insert",
    changed_by: null,
    changed_at: "2026-01-01T00:00:00+00:00",
    old: null,
    new: null,
    version: 1,
  };
}

function byId<Row extends { id: string | number }>(items: Row[]): ReadonlyMap<string, Row> {
  return new Map(items.map((item) => [String(item.id), item]));
}
