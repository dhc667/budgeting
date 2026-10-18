import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { Instance } from "../src/instance/connect-link.ts";
import { fail } from "./fail.ts";

export type Env = NodeJS.Dict<string>;

// Only the file counts: process.loadEnvFile would let variables already exported in the shell win,
// and those may belong to another project's database.
export function readEnvFile(path: string): Env {
  if (!existsSync(path)) {
    fail(`No env file at ${path}. Copy .env.instance.example to .env.instance and fill it in.`);
  }
  return parseEnv(readFileSync(path, "utf8"));
}

export function instanceFromEnv(env: Env): Instance {
  return {
    supabaseUrl: requireEnv(env, "SUPABASE_URL"),
    publishableKey: requireEnv(env, "SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function requireEnv(env: Env, name: string): string {
  const value = env[name];
  if (!value) fail(`${name} is not set. Add it to your env file (see .env.instance.example).`);
  return value;
}
