// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import { openApp } from "../support/app";
import { signInLink, sql } from "../support/local-instance";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(() => sql.end());

// Pinned on purpose: rolling the database back means deleting Drizzle's record of the latest
// migration, so this test depends on how the migrator stores what it applied. That record is
// global, so no other test file may run while it is gone.
it("asks for the database to be updated instead of opening", async () => {
  const [latest] = await sql<MigrationRow[]>`
    select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 1`;
  if (!latest) throw new Error("No migrations applied; run pnpm db:start");
  await sql`delete from drizzle.__drizzle_migrations where id = ${latest.id}`;
  try {
    openApp(signInLink());

    expect(await screen.findByRole("heading", { name: /needs an update/ })).toBeTruthy();
  } finally {
    await sql`insert into drizzle.__drizzle_migrations ${sql(latest, "id", "hash", "created_at")}`;
  }
});

type MigrationRow = { id: number; hash: string; created_at: string };
