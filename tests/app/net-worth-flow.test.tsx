// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addAccount, goHome, openSignedIn, uniqueName } from "../support/app";
import { sql } from "../support/local-instance";

// The provider is unreachable: the dashboard works from the rates the instance already holds.
vi.mock("../../src/rates/rates-provider", () => ({
  fetchLatestRates: () => Promise.reject(new Error("offline")),
  fetchRatesBetween: () => Promise.reject(new Error("offline")),
}));

const converted = "XTA";
const stale = "XTB";
const unrated = "XTC";

beforeAll(async () => {
  await sql`insert into currencies (code, decimals) values (${converted}, 2), (${stale}, 2), (${unrated}, 2) on conflict do nothing`;
});

beforeEach(async () => {
  localStorage.clear();
  await sql`delete from exchange_rates where currency in ${sql([converted, stale, unrated])}`;
  await sql`insert into exchange_rates (date, currency, rate) values
    (current_date, ${converted}, 4), (current_date - 8, ${stale}, 2)`;
});

afterEach(cleanup);

afterAll(async () => {
  await sql`delete from exchange_rates where currency in ${sql([converted, stale, unrated])}`;
  await sql.end();
});

describe("net worth", () => {
  it("adds up accounts in different currencies in the display currency", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await addAccount({ name: "Abroad", openingBalance: "40", currency: converted });

    await goHome();

    const card = within(await screen.findByRole("region", { name: "Net worth" }));
    expect((await card.findByText("$110.00")).textContent).toBe("$110.00");
    expect(card.queryByText(/exchange rate/)).toBeNull();
  });

  it("leaves out an account whose currency has no rate, and says so", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await addAccount({ name: "Havana", openingBalance: "7", currency: unrated });

    await goHome();

    const card = within(await screen.findByRole("region", { name: "Net worth" }));
    expect(await card.findByText("$100.00")).toBeTruthy();
    expect(card.getByText(/no exchange rate yet/)).toBeTruthy();
    expect(card.getByText(/Havana: .*7\.00/)).toBeTruthy();
  });

  it("dates a stale rate that a balance was converted with", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Old rate", openingBalance: "10", currency: stale });

    await goHome();

    const card = within(await screen.findByRole("region", { name: "Net worth" }));
    expect(await card.findByText("$5.00")).toBeTruthy();
    expect(card.getByText(new RegExp(`${stale} exchange rate is from`))).toBeTruthy();
  });
});
