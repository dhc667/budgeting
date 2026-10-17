import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";

// Every run signs up new users, and a database full of them slows the screens tests use down to
// timeouts. Cascading from the users empties everything recorded since; the rows migrations seed
// (currencies, starter categories) stay.
export async function teardown() {
  const env = parseEnv(readFileSync(".env.instance.local", "utf8"));
  const sql = postgres(env.DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try {
    await sql`truncate auth.users cascade`;
  } finally {
    await sql.end();
  }
}
