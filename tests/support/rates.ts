import { daysAgo } from "./dates";
import type { FakeCurrencyCode } from "./fake-currencies";
import { sql } from "./local-instance";

export const rateDays = 5;

// Yesterday and the days before it, so a test can add today's rate on top.
export function rateDates(): string[] {
  return Array.from({ length: rateDays }, (_, day) => daysAgo(day + 1)).sort();
}

export async function addRates(...currencies: FakeCurrencyCode[]) {
  await sql`insert into public.currencies (code, decimals)
    select code, 2 from unnest(${currencies}::text[]) as code on conflict do nothing`;
  await sql`insert into public.exchange_rates (date, currency, rate)
    select (${daysAgo(1)}::date - day), code, 1.5
    from unnest(${currencies}::text[]) as code, generate_series(0, ${rateDays - 1}) as day
    on conflict do nothing`;
}
