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
  stubbedProvider.requests = [];
  stubbedProvider.latestRequests = 0;
  stubbedProvider.historyStarts = new Map();
  stubbedProvider.providerId = "stub";
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
    // Like a currency the family no longer uses, whose rates end months ago.
    await storeRates(byHand, 90, 120, 40);
    await storeRates(provided, 0, 0, 4);
    const ana = await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await sql`update transactions set date = current_date - 20 where created_by = ${ana.userId}`;

    await reopenApp();

    const client = await signedInAs(ana.email);
    await vi.waitFor(
      async () =>
        expect(rateDateFor(await datesStored(client, provided), daysAgo(20))).toBe(daysAgo(20)),
      {
        timeout: 10_000,
      },
    );
    const handLoaded = await ratesStored(client, byHand);
    expect(handLoaded).toHaveLength(31);
    expect(handLoaded.every(({ rate }) => rate === 40)).toBe(true);
    expect(stubbedProvider.requests.flatMap(({ currencies }) => currencies)).not.toContain(byHand);
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
    await vi.waitFor(
      async () =>
        expect(rateDateFor(await datesStored(client, alsoProvided), daysAgo(20))).toBe(daysAgo(20)),
      {
        timeout: 10_000,
      },
    );
    expect(rateDateFor(await datesStored(client, provided), daysAgo(20))).toBe(daysAgo(20));
  });

  it("asks the provider only for the currencies with rates missing", async () => {
    await storeRates(provided, 0, 25, 4);
    await storeRates(alsoProvided, 0, 0, 5);
    const ana = await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await sql`update transactions set date = current_date - 20 where created_by = ${ana.userId}`;
    stubbedProvider.requests = [];

    await reopenApp();

    const client = await signedInAs(ana.email);
    await vi.waitFor(
      async () =>
        expect(rateDateFor(await datesStored(client, alsoProvided), daysAgo(20))).toBe(daysAgo(20)),
      {
        timeout: 10_000,
      },
    );
    expect(stubbedProvider.requests.map(({ currencies }) => currencies)).toEqual([[alsoProvided]]);
  });

  describe("when the provider's history for a currency starts after the oldest transaction", () => {
    it("doesn't ask for it again from any device", async () => {
      const ana = await backfilledToWhereHistoryStarts();

      await openOnAnotherDevice(ana.email);

      expect(await currenciesAskedForOlderRates(ana)).toEqual([provided]);
    });

    it("asks again once the rates come from another provider", async () => {
      const ana = await backfilledToWhereHistoryStarts();
      stubbedProvider.providerId = "another";

      await openOnAnotherDevice(ana.email);

      expect(await currenciesAskedForOlderRates(ana)).toEqual([provided, alsoProvided]);
    });

    it("asks again a month later, in case the provider has added older rates", async () => {
      const ana = await backfilledToWhereHistoryStarts();
      await sql`update exchange_rate_history_starts set checked_on = current_date - 31
        where currency = ${alsoProvided}`;

      await openOnAnotherDevice(ana.email);

      expect(await currenciesAskedForOlderRates(ana)).toEqual([provided, alsoProvided]);
    });
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
      async () =>
        expect(rateDateFor(await datesStored(client, provided), daysAgo(20))).toBe(daysAgo(21)),
      { timeout: 10_000 },
    );
  });

  it("syncs once a day: not when the app is brought back the same day, but on the next", async () => {
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
    window.dispatchEvent(new Event("visibilitychange"));
    // Long enough for a sync to have asked the provider, had it started.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(stubbedProvider.latestRequests).toBe(1);

    vi.setSystemTime(realNow);
    window.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(
      async () => expect(await datesStored(client, provided)).toEqual([today, yesterday]),
      { timeout: 10_000 },
    );
  });
});

// The provider has rates for alsoProvided only from 10 days ago, and Ana's oldest transaction is 20
// days old. Then she records an older one, for which only the provided currency has rates to ask.
async function backfilledToWhereHistoryStarts() {
  stubbedProvider.historyStarts.set(alsoProvided, daysAgo(10));
  await storeRates(provided, 0, 20, 4);
  const ana = await openSignedIn(uniqueName("Ana"));
  await addAccount({ name: "Checking", openingBalance: "100" });
  await sql`update transactions set date = current_date - 20 where created_by = ${ana.userId}`;
  await reopenApp();
  const client = await signedInAs(ana.email);
  await vi.waitFor(
    async () => expect((await datesStored(client, alsoProvided)).at(-1)).toBe(daysAgo(10)),
    { timeout: 10_000 },
  );
  await sql`update transactions set date = current_date - 25 where created_by = ${ana.userId}`;
  return ana;
}

// Once the older transaction has its rate, the request that brought it is the last one made.
async function currenciesAskedForOlderRates(ana: { email: string }) {
  const client = await signedInAs(ana.email);
  await vi.waitFor(
    async () =>
      expect(rateDateFor(await datesStored(client, provided), daysAgo(25))).toBe(daysAgo(25)),
    { timeout: 10_000 },
  );
  return stubbedProvider.requests.at(-1)?.currencies;
}

async function openOnAnotherDevice(email: string) {
  await goHome();
  cleanup();
  localStorage.clear();
  openApp(signInLink());
  await signIn(email, password);
  await screen.findByRole("heading", { name: /^Good/ });
}

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

// A day trades at the latest rate on or before it; dates come newest first.
function rateDateFor(dates: string[], day: string): string | undefined {
  return dates.find((date) => date <= day);
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
