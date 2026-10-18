import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { type Env, requireEnv } from "./env.ts";

export async function migrateDatabase(env: Env, migrationsFolder = appMigrationsFolder()) {
  // Loaded here because drizzle takes half a second to start, and only migrating needs it.
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(requireEnv(env, "DATABASE_URL"), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
  console.log("The database is up to date.");
}

export function appMigrationsFolder(): string {
  return fileURLToPath(new URL("../db/migrations", import.meta.url));
}
