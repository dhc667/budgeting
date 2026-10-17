// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addAccount, goHome, openApp, openSignedIn, uniqueName } from "../support/app";
import { signInLink, sql } from "../support/local-instance";

const provided = "XTA";
const byHand = "XTH";

// The provider covers both currencies and has a rate for every day asked about.
vi.mock("../../src/rates/rates-provider", () => {
  const days = (from: string, to: string) => {
    const result: string[] = [];
    for (let day = new Date(from); day <= new Date(to); day.setUTCDate(day.getUTCDate() + 1))
      result.push(day.toISOString().slice(0, 10));
    return result;
  };
  const ratesFor = (dates: string[]) =>
    dates.flatMap((date) => [
      { date, currency: "XTA", rate: 4 },
      { date, currency: "XTH", rate: 24 },
    ]);
  return {
    fetchLatestRates: () => Promise.resolve(ratesFor([new Date().toISOString().slice(0, 10)])),
    fetchRatesBetween: (from: string, to: string) => Promise.resolve(ratesFor(days(from, to))),
  };
});

beforeAll(async () => {
  await sql`insert into currencies (code, decimals) values (${provided}, 2) on conflict do nothing`;
  await sql`insert into currencies (code, decimals, rates_by_hand) values (${byHand}, 2, true) on conflict (code) do update set rates_by_hand = true`;
});

beforeEach(async () => {
  localStorage.clear();
  await clearRates();
  await sql`insert into exchange_rates (date, currency, rate)
    select current_date - n, ${byHand}, 40 from generate_series(0, 30) as n`;
  await sql`insert into exchange_rates (date, currency, rate) values (current_date, ${provided}, 4)`;
});

afterEach(cleanup);

afterAll(async () => {
  await clearRates();
  await sql.end();
});

describe("filling in missing exchange rates", () => {
  it("backfills a provided currency to the oldest transaction, and leaves a hand-loaded one alone", async () => {
    const { userId } = await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await sql`update transactions set date = current_date - 20 where created_by = ${userId}`;
    await goHome();

    cleanup();
    openApp(signInLink());
    await screen.findByRole("heading", { name: /^Good/ });

    await vi.waitFor(async () => expect(await storedFor(provided)).toBe(21), { timeout: 10_000 });
    expect(await storedFor(byHand)).toBe(31);
    const [odd] = await sql`select count(*)::int as count from exchange_rates
      where currency = ${byHand} and rate <> 40`;
    expect(odd?.count).toBe(0);
  });
});

async function storedFor(currency: string): Promise<number> {
  const [row] = await sql<
    { count: number }[]
  >`select count(*)::int as count from exchange_rates where currency = ${currency}`;
  return row?.count ?? 0;
}

async function clearRates() {
  await sql`delete from exchange_rates where currency in ${sql([provided, byHand])}`;
}
