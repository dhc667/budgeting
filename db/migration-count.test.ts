import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { migrationCount } from "./migration-count.ts";

function migrationsFolder(entries: { tag: string; when: number }[], files: string[]): URL {
  const folder = mkdtempSync(join(tmpdir(), "migrations-"));
  mkdirSync(join(folder, "meta"));
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify({ entries }));
  for (const file of files) writeFileSync(join(folder, file), "select 1;");
  return pathToFileURL(`${folder}/`);
}

describe("migrationCount", () => {
  it("counts the migrations in the journal", () => {
    const folder = migrationsFolder(
      [
        { tag: "0000_a", when: 1 },
        { tag: "0001_b", when: 2 },
      ],
      ["0000_a.sql", "0001_b.sql"],
    );

    expect(migrationCount(folder)).toBe(2);
  });

  it("refuses a migration dated before the one it follows", () => {
    const folder = migrationsFolder(
      [
        { tag: "0000_a", when: 2 },
        { tag: "0001_b", when: 1 },
      ],
      ["0000_a.sql", "0001_b.sql"],
    );

    expect(() => migrationCount(folder)).toThrow(/0001_b is dated before 0000_a/);
  });

  it("refuses a migration file the journal doesn't list", () => {
    const folder = migrationsFolder([{ tag: "0000_a", when: 1 }], ["0000_a.sql", "0001_b.sql"]);

    expect(() => migrationCount(folder)).toThrow(/Not in the journal: 0001_b/);
  });

  it("refuses a journal entry with no file", () => {
    const folder = migrationsFolder(
      [
        { tag: "0000_a", when: 1 },
        { tag: "0001_b", when: 2 },
      ],
      ["0000_a.sql"],
    );

    expect(() => migrationCount(folder)).toThrow(/Missing files: 0001_b/);
  });

  it("agrees with the repository's migrations", () => {
    expect(migrationCount()).toBeGreaterThan(0);
  });
});
