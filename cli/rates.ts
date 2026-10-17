import type { Sql } from "postgres";
import * as z from "zod";
import { defined } from "./defined.ts";

// The file becomes the currency's whole rate history, replacing any rates a device fetched before
// the flag was set; from then on the app never saves any for it.
export async function loadRatesByHand(sql: Sql, file: RatesFile): Promise<LoadedRates> {
  return sql.begin(async (tx) => {
    const [currency] = await tx<{ code: string }[]>`
      update public.currencies set rates_by_hand = true
      where code = ${file.currency} returning code`;
    if (!currency) throw new RatesError(`${file.currency} isn't a currency the app knows.`);

    await tx`delete from public.exchange_rates where currency = ${file.currency}`;
    await tx`
      insert into public.exchange_rates (date, currency, rate)
      select r.date, ${file.currency}, r.rate
      from jsonb_to_recordset(${tx.json(file.rates)}::jsonb) as r(date date, rate numeric)`;

    const [loaded] = await tx<LoadedRates[]>`
      select count(*)::integer as count, min(date)::text as "from", max(date)::text as "to"
      from public.exchange_rates where currency = ${file.currency}`;
    return defined(loaded);
  });
}

export class RatesError extends Error {}

export type LoadedRates = { count: number; from: string; to: string };

// Rates are units of the currency per 1 USD, the base, which has none of its own.
export const ratesFile = z
  .strictObject({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .refine((code) => code !== "USD", "USD is the base: it has no rates"),
    rates: z.array(z.strictObject({ date: z.iso.date(), rate: z.number().positive() })).min(1),
  })
  .superRefine((file, context) => {
    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set<string>();
    file.rates.forEach(({ date }, i) => {
      if (seen.has(date)) {
        context.addIssue({ code: "custom", path: ["rates", i], message: `${date} repeats` });
      }
      if (date > today) {
        context.addIssue({
          code: "custom",
          path: ["rates", i],
          message: `${date} is in the future`,
        });
      }
      seen.add(date);
    });
  });

export type RatesFile = z.infer<typeof ratesFile>;
