// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addAccount, goHome, openApp, openSignedIn, signIn, uniqueName } from "../support/app";
import { daysAgo } from "../support/dates";
import { existingUser, password, signedInAs, signInLink, sql } from "../support/local-instance";
import { stubbedProvider } from "../support/rates-provider";

const provided = "XTA";
const alsoProvided = "XTB";
const byHand = "XTH";

vi.mock("../../src/rates/rates-provider", async () => {
  const { stubbedProvider } = await import("../support/rates-provider");
  return stubbedProvider;
});

beforeAll(async () => {
  await sql`insert into currencies (code, decimals) values (${provided}, 2), (${alsoProvided}, 2) on conflict do nothing`;
  await sql`insert into currencies (code, decimals, rates_by_hand) values (${byHand}, 2, true) on conflict (code) do update set rates_by_hand = true`;
});

beforeEach(async () => {
  localStorage.clear();
  stubbedProvider.rates = new Map([
    [provided, 4],
    [alsoProvided, 5],
    [byHand, 24],
  ]);
  stubbedProvider.hasRatesOn = () => true;
  await clearRates();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

afterAll(async () => {
  await clearRates();
  await sql.end();
});

describe("filling in missing exchange rates", () => {
  it("backfills a provided currency to the oldest transaction, and leaves a hand-loaded one alone", async () => {
    await storeRates(byHand, 0, 30, 40);
    await storeRates(provided, 0, 0, 4);
    const ana = await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await sql`update transactions set date = current_date - 20 where created_by = ${ana.userId}`;

    await reopenApp();

    const client = await signedInAs(ana.email);
    await vi.waitFor(async () => expect(await datesStored(client, provided)).toHaveLength(21), {
      timeout: 10_000,
    });
    const handLoaded = await ratesStored(client, byHand);
    expect(handLoaded).toHaveLength(31);
    expect(handLoaded.every(({ rate }) => rate === 40)).toBe(true);
  });

  it("backfills a currency the provider only starts covering later", async () => {
    stubbedProvider.rates.delete(alsoProvided);
    await storeRates(provided, 0, 20, 4);
    const ana = await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await sql`update transactions set date = current_date - 20 where created_by = ${ana.userId}`;
    stubbedProvider.rates.set(alsoProvided, 5);

    await reopenApp();

    const client = await signedInAs(ana.email);
    await vi.waitFor(async () => expect(await datesStored(client, alsoProvided)).toHaveLength(21), {
      timeout: 10_000,
    });
    expect(await datesStored(client, provided)).toHaveLength(21);
  });

  it("gives an oldest transaction on a day without published rates the rate from before it", async () => {
    stubbedProvider.hasRatesOn = (day) => day !== daysAgo(20) && day !== daysAgo(19);
    await storeRates(provided, 0, 0, 4);
    const ana = await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await sql`update transactions set date = current_date - 20 where created_by = ${ana.userId}`;

    await reopenApp();

    const client = await signedInAs(ana.email);
    await vi.waitFor(
      async () => expect((await datesStored(client, provided)).at(-1)).toBe(daysAgo(21)),
      { timeout: 10_000 },
    );
  });

  it("syncs again when the app is brought back on a new day", async () => {
    const ana = await existingUser(uniqueName("Ana"));
    const [yesterday, today] = [daysAgo(1), daysAgo(0)];
    const realNow = Date.now();
    vi.useFakeTimers({ toFake: ["Date"], now: realNow - 24 * 3_600_000 });
    openApp(signInLink());
    await signIn(ana.email, password);
    await screen.findByRole("heading", { name: /^Good/ });
    const client = await signedInAs(ana.email);
    await vi.waitFor(async () => expect(await datesStored(client, provided)).toEqual([yesterday]), {
      timeout: 10_000,
    });

    vi.setSystemTime(realNow);
    window.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(
      async () => expect(await datesStored(client, provided)).toEqual([today, yesterday]),
      { timeout: 10_000 },
    );
  });
});

async function reopenApp() {
  await goHome();
  cleanup();
  openApp(signInLink());
  await screen.findByRole("heading", { name: /^Good/ });
}

type Client = Awaited<ReturnType<typeof signedInAs>>;

async function ratesStored(client: Client, currency: string) {
  const { data, error } = await client
    .from("exchange_rates")
    .select("date, rate")
    .eq("currency", currency)
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}

async function datesStored(client: Client, currency: string): Promise<string[]> {
  return (await ratesStored(client, currency)).map(({ date }) => date);
}

async function storeRates(
  currency: string,
  newestDaysAgo: number,
  oldestDaysAgo: number,
  rate: number,
) {
  await sql`insert into exchange_rates (date, currency, rate)
    select current_date - n, ${currency}, ${rate} from generate_series(${newestDaysAgo}::int, ${oldestDaysAgo}::int) as n`;
}

async function clearRates() {
  await sql`delete from exchange_rates where currency in ${sql([provided, alsoProvided, byHand])}`;
}
