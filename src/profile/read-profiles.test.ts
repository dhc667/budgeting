import { describe, expect, it } from "vitest";
import { keyOfId, type RowOf } from "../sync/copy";
import { readProfile, readUsers } from "./read-profiles";

describe("reading the signed-in user's profile", () => {
  it("is the user's row", () => {
    const profiles = byId([profile("u1", "Ana"), profile("u2", "Bea")]);

    expect(readProfile({ profiles }, "u2")?.display_name).toBe("Bea");
  });

  it("is null once the copy lacks the user, who was deleted", () => {
    expect(readProfile({ profiles: byId([profile("u1", "Ana")]) }, "u2")).toBeNull();
  });
});

describe("reading users", () => {
  it("has each user's id and name, ordered by name", () => {
    const users = readUsers({
      profiles: byId([profile("u1", "Carla"), profile("u2", "Ana"), profile("u3", "Bea")]),
    });

    expect(users).toEqual([
      { id: "u2", display_name: "Ana" },
      { id: "u3", display_name: "Bea" },
      { id: "u1", display_name: "Carla" },
    ]);
  });
});

function profile(id: string, display_name: string): RowOf<"profiles"> {
  return {
    id,
    display_name,
    created_at: "2026-01-01T00:00:00+00:00",
    date_format: null,
    display_currency: "USD",
    language: null,
    number_format: null,
    upcoming_days: 7,
    version: 1,
  };
}

function byId(items: RowOf<"profiles">[]): ReadonlyMap<string, RowOf<"profiles">> {
  return new Map(items.map((item) => [keyOfId(item.id), item]));
}
