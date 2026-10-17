import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { signedInUser, sql } from "../support/local-instance";

// A made-up currency, so loading rates by hand leaves the instance's real ones alone. It stays,
// as the other made-up currencies do.
const currency = "XTL";

beforeEach(async () => {
  await sql`insert into currencies (code, decimals) values (${currency}, 2) on conflict (code) do update set rates_by_hand = false`;
  await sql`delete from exchange_rates where currency = ${currency}`;
});

afterAll(async () => {
  await sql`delete from exchange_rates where currency = ${currency}`;
  await sql.end();
});

describe("loading a currency's rates by hand", () => {
  it("replaces every rate the app had for it", async () => {
    const ana = await signedInUser("Ana");
    await ana.client.rpc("save_exchange_rates", {
      rate_dates: [daysAgo(1)],
      rate_currencies: [currency],
      rate_values: [24],
    });

    const run = loadRates({
      currency,
      rates: [
        { date: daysAgo(30), rate: 700 },
        { date: daysAgo(3), rate: 720.5 },
      ],
    });

    expect(run.stderr).toBe("");
    expect(run.stdout).toContain(
      `Loaded 2 ${currency} rates, from ${daysAgo(30)} to ${daysAgo(3)}.`,
    );
    expect(await storedRates()).toEqual([
      { date: daysAgo(30), rate: "700" },
      { date: daysAgo(3), rate: "720.5" },
    ]);
  });

  it("stops the app saving any it fetches for that currency", async () => {
    loadRates({ currency, rates: [{ date: daysAgo(3), rate: 700 }] });
    const ana = await signedInUser("Ana");

    await ana.client.rpc("save_exchange_rates", {
      rate_dates: [daysAgo(1)],
      rate_currencies: [currency],
      rate_values: [24],
    });

    expect(await storedRates()).toEqual([{ date: daysAgo(3), rate: "700" }]);
  });

  it("refuses a file with a date twice or in the future, saying which, and changes nothing", async () => {
    const run = loadRates({
      currency,
      rates: [
        { date: daysAgo(3), rate: 700 },
        { date: daysAgo(3), rate: 710 },
        { date: daysAgo(-3), rate: 720 },
      ],
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`${daysAgo(3)} repeats`);
    expect(run.stderr).toContain(`${daysAgo(-3)} is in the future`);
    expect(run.stderr).toContain("rates[2]");
    expect(await storedRates()).toEqual([]);
  });

  it("refuses a currency the app doesn't know", () => {
    const run = loadRates({ currency: "XZZ", rates: [{ date: daysAgo(3), rate: 1 }] });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("XZZ isn't a currency the app knows.");
  });
});

function loadRates(contents: unknown) {
  const path = join(mkdtempSync(join(tmpdir(), "rates-")), "rates.json");
  writeFileSync(path, JSON.stringify(contents));
  return spawnSync(
    "node",
    ["cli/instance.ts", "load-rates", path, "--env", ".env.instance.local"],
    {
      encoding: "utf8",
    },
  );
}

async function storedRates() {
  return sql<{ date: string; rate: string }[]>`
    select date::text, rate::text from exchange_rates where currency = ${currency} order by date`;
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
