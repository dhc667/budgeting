// The only module that knows where rates come from. Rates are units per 1 USD.
export async function fetchLatestRates(): Promise<ProviderRate[]> {
  return parseRates(await get({ base: "USD" }));
}

export async function fetchRatesBetween(from: string, to: string): Promise<ProviderRate[]> {
  const rates = parseRates(await get({ base: "USD", from, to }));
  // For a currency with no rate on `from`, the provider also sends the one before it, which is the
  // rate `from` itself trades at.
  return rates.filter(({ date }) => date <= to);
}

async function get(query: Record<string, string>): Promise<unknown> {
  const response = await fetch(`${endpoint}?${new URLSearchParams(query)}`);
  if (!response.ok) throw new Error(`The rates provider answered ${response.status}`);
  return response.json();
}

const endpoint = "https://api.frankfurter.dev/v2/rates";

function parseRates(body: unknown): ProviderRate[] {
  if (!Array.isArray(body)) throw new Error("The rates provider sent something unexpected");
  return body.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    if (!("date" in entry && "quote" in entry && "rate" in entry)) return [];
    const { date, quote, rate } = entry;
    if (typeof date !== "string" || typeof quote !== "string" || typeof rate !== "number")
      return [];
    return rate > 0 ? [{ date, currency: quote, rate }] : [];
  });
}

export type ProviderRate = { date: string; currency: string; rate: number };
