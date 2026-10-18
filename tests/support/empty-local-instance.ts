import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";
import { fakeCurrencyCodes } from "./fake-currencies";

// Every run signs up new users, and a database full of them slows the screens tests use down to
// timeouts. Cascading from the users empties everything recorded since; the rows migrations seed
// (currencies, starter categories) stay. Deleted rows and rates have no foreign key to follow, and
// piled up to tens of thousands of rows that every first pull has to download. So do the made-up
// currencies tests give rates to.
export async function teardown() {
  const sql = postgres(localDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    await sql`truncate auth.users cascade`;
    await sql`truncate public.deleted_rows, public.exchange_rates, public.exchange_rate_history_starts`;
    await sql`delete from public.currencies where code = any (${fakeCurrencyCodes})`;
  } finally {
    await sql.end();
  }
}

// Without a URL, postgres falls back to the PG* variables, which may point anywhere.
function localDatabaseUrl(): string {
  const url = parseEnv(readFileSync(".env.instance.local", "utf8")).DATABASE_URL;
  if (!url) throw new Error(".env.instance.local has no DATABASE_URL: nothing was emptied.");
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`${hostname} isn't the local database: nothing was emptied.`);
  }
  return url;
}
