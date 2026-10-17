import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  anonClient,
  signedInUser,
  sql,
  type SignedInUser as User,
} from "../support/local-instance.ts";
import { daysAgo, today } from "../support/dates.ts";

// Made-up currencies, so these tests leave the instance's real rates alone. The currencies
// themselves stay: profiles and accounts may still point at them.
const fresh = "XTA";
const old = "XTB";
const unrated = "XTC";
const byHand = "XTH";

beforeAll(async () => {
  await sql`insert into currencies (code, decimals) values (${fresh}, 2), (${old}, 2), (${unrated}, 2) on conflict do nothing`;
  await sql`insert into currencies (code, decimals, rates_by_hand) values (${byHand}, 2, true) on conflict (code) do update set rates_by_hand = true`;
});

beforeEach(clearRates);

afterAll(async () => {
  await clearRates();
  await sql.end();
});

describe("saving exchange rates", () => {
  it("is refused to anyone who isn't signed in", async () => {
    const { error } = await save(anonClient(), [rate(today(), fresh, 4)]);

    expect(error).not.toBeNull();
    expect(await storedRates()).toEqual([]);
  });

  it("stores a batch for a signed-in user, who can read it back", async () => {
    const ana = await signedInUser("Ana");

    const { error } = await save(ana.client, [
      rate(today(), fresh, 4.25),
      rate(daysAgo(1), old, 2),
    ]);

    expect(error).toBeNull();
    expect(await storedRates()).toEqual([
      { date: daysAgo(1), currency: old, rate: "2" },
      { date: today(), currency: fresh, rate: "4.25" },
    ]);
    const { data } = await ana.client
      .from("exchange_rates")
      .select("currency")
      .in("currency", [fresh]);
    expect(data).toEqual([{ currency: fresh }]);
  });

  it("leaves a rate already stored for that day and currency as it was", async () => {
    const [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
    await save(ana.client, [rate(today(), fresh, 4)]);

    const { error } = await save(ben.client, [rate(today(), fresh, 9), rate(today(), old, 3)]);

    expect(error).toBeNull();
    expect(await storedRates()).toEqual([
      { date: today(), currency: fresh, rate: "4" },
      { date: today(), currency: old, rate: "3" },
    ]);
  });

  it("skips currencies whose rates are loaded by hand, and still saves the others", async () => {
    const ana = await signedInUser("Ana");
    await sql`insert into exchange_rates (date, currency, rate) values (${daysAgo(3)}, ${byHand}, 40)`;

    const { error } = await save(ana.client, [
      rate(today(), byHand, 24),
      rate(daysAgo(3), byHand, 24),
      rate(today(), fresh, 4),
    ]);

    expect(error).toBeNull();
    expect(await storedRates()).toEqual([
      { date: daysAgo(3), currency: byHand, rate: "40" },
      { date: today(), currency: fresh, rate: "4" },
    ]);
  });

  it("refuses a date in the future", async () => {
    const ana = await signedInUser("Ana");

    const { error } = await save(ana.client, [
      rate(today(), fresh, 4),
      rate("2999-01-01", fresh, 4),
    ]);

    expect(error?.message).toMatch(/future/);
    expect(await storedRates()).toEqual([]);
  });

  it.each([0, -1.5])("refuses a rate of %s", async (value) => {
    const ana = await signedInUser("Ana");

    const { error } = await save(ana.client, [rate(today(), fresh, value)]);

    expect(error).not.toBeNull();
    expect(await storedRates()).toEqual([]);
  });

  it("doesn't let a user change the table directly", async () => {
    const ana = await signedInUser("Ana");
    await save(ana.client, [rate(today(), fresh, 4)]);

    const inserted = await ana.client
      .from("exchange_rates")
      .insert({ date: daysAgo(1), currency: fresh, rate: 1 });
    const updated = await ana.client
      .from("exchange_rates")
      .update({ rate: 99 })
      .eq("currency", fresh);
    const deleted = await ana.client.from("exchange_rates").delete().eq("currency", fresh);

    expect(inserted.error).not.toBeNull();
    expect(updated.error).not.toBeNull();
    expect(deleted.error).not.toBeNull();
    expect(await storedRates()).toEqual([{ date: today(), currency: fresh, rate: "4" }]);
  });
});

describe("latest exchange rates", () => {
  it("gives each currency its newest rate, stale when over 7 days older than the newest of all", async () => {
    const ana = await signedInUser("Ana");
    await save(ana.client, [
      rate(today(), fresh, 4),
      rate(daysAgo(9), fresh, 3),
      rate(daysAgo(7), old, 2),
      rate(daysAgo(8), unrated, 1),
    ]);

    const { data } = await ana.client.rpc("latest_exchange_rates");

    const ours = data?.filter(({ currency }) => [fresh, old, unrated].includes(currency));
    expect(ours?.sort((a, b) => a.currency.localeCompare(b.currency))).toEqual([
      { currency: fresh, date: today(), rate: 4, stale: false },
      { currency: old, date: daysAgo(7), rate: 2, stale: false },
      { currency: unrated, date: daysAgo(8), rate: 1, stale: true },
    ]);
  });
});

describe("changing the display currency", () => {
  let ana: User;

  beforeEach(async () => {
    ana = await signedInUser("Ana");
    await save(ana.client, [rate(today(), fresh, 4), rate(daysAgo(8), old, 2)]);
  });

  it("starts as USD, even with no rates at all", async () => {
    expect(await displayCurrencyOf(ana)).toBe("USD");
  });

  it("accepts USD and a currency with a fresh rate", async () => {
    expect((await setDisplayCurrency(ana, fresh)).error).toBeNull();
    expect(await displayCurrencyOf(ana)).toBe(fresh);

    expect((await setDisplayCurrency(ana, "USD")).error).toBeNull();
    expect(await displayCurrencyOf(ana)).toBe("USD");
  });

  it("refuses a currency whose rate is stale", async () => {
    const { error } = await setDisplayCurrency(ana, old);

    expect(error?.message).toMatch(/recent exchange rate/);
    expect(await displayCurrencyOf(ana)).toBe("USD");
  });

  it("refuses a currency with no rate", async () => {
    const { error } = await setDisplayCurrency(ana, unrated);

    expect(error?.message).toMatch(/recent exchange rate/);
    expect(await displayCurrencyOf(ana)).toBe("USD");
  });

  it("still lets the user change their name while their currency has gone stale", async () => {
    await setDisplayCurrency(ana, fresh);
    await sql`update exchange_rates set date = ${daysAgo(30)} where currency = ${fresh}`;
    await save(ana.client, [rate(today(), old, 2)]);

    const { error } = await ana.client
      .from("profiles")
      .update({ display_name: "Ana B", display_currency: fresh })
      .eq("id", ana.userId);

    expect(error).toBeNull();
  });
});

function save(client: User["client"], rates: Rate[]) {
  return client.rpc("save_exchange_rates", {
    rates: rates.map(({ date, currency, value }) => ({ date, currency, rate: value })),
  });
}

function setDisplayCurrency(user: User, currency: string) {
  return user.client.from("profiles").update({ display_currency: currency }).eq("id", user.userId);
}

async function displayCurrencyOf(user: User) {
  const { data, error } = await user.client
    .from("profiles")
    .select("display_currency")
    .eq("id", user.userId)
    .single();
  if (error) throw error;
  return data.display_currency;
}

async function storedRates() {
  return sql`select date::text, currency, rate::text from exchange_rates where currency in ${sql([fresh, old, unrated, byHand])} order by date, currency`;
}

async function clearRates() {
  await sql`delete from exchange_rates where currency in ${sql([fresh, old, unrated, byHand])}`;
}

type Rate = { date: string; currency: string; value: number };

function rate(date: string, currency: string, value: number): Rate {
  return { date, currency, value };
}
