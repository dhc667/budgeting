import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";

// Every run signs up new users, and a database full of them slows the screens tests use down to
// timeouts. Cascading from the users empties everything recorded since; the rows migrations seed
// (currencies, starter categories) stay.
export async function teardown() {
  const sql = postgres(localDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    await sql`truncate auth.users cascade`;
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
