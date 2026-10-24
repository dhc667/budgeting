import { describe, expect, it } from "vitest";
import { Directory } from "./directory.ts";

describe("a short id", () => {
  it("is the first 8 characters of an id, longer when another id starts the same way", () => {
    const spaces = ["0123456789-a", "01234567ab-b", "fedcba98-c"].map((id) => ({
      id,
      name: id,
      private: false,
    }));
    const directory = new Directory(spaces, [], [], [], new Map());

    expect(spaces.map(({ id }) => directory.shortId(id))).toEqual([
      "012345678",
      "01234567a",
      "fedcba98",
    ]);
    expect(directory.shortId("fedcba98-c", ["fedcba98-d"])).toBe("fedcba98-c");
  });
});
