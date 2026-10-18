import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { type Env, requireEnv } from "./env.ts";

export async function migrateDatabase(env: Env, migrationsFolder = appMigrationsFolder()) {
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
