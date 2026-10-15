import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import qrcode from "qrcode-terminal";
import { buildConnectLink, type ConnectRequest } from "../src/instance/connect-link.ts";
import type { Database } from "../src/supabase/database.types.ts";
import { createInviteCode } from "./invites.ts";

const usage = `Usage: pnpm instance <command> [--env <file>]

Commands:
  migrate                     Apply pending database migrations
  invite [--expires <hours>]  Print a one-time signup QR code (expires in 24 hours by default)
  link                        Print a QR code that connects a device to sign in, without an invite
  reset-password <email>      Give a user a temporary password

Options:
  --env <file>                Instance settings (default: .env.instance; see .env.instance.example)
`;

type Options = { args: string[]; expiresInHours: number; env: Env };

type Env = NodeJS.Dict<string>;

const commands: Record<string, (options: Options) => void | Promise<void>> = {
  migrate: migrateDatabase,
  invite,
  link,
  "reset-password": resetPassword,
};

await main();

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      env: { type: "string", default: ".env.instance" },
      expires: { type: "string", default: "24" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [name, ...args] = positionals;
  const command = name ? commands[name] : undefined;
  if (!command || values.help) {
    console.log(usage);
    process.exit(values.help ? 0 : 1);
  }

  const env = readEnvFile(values.env);
  const expiresInHours = Number(values.expires);
  if (!(expiresInHours > 0)) fail("--expires must be a positive number of hours.");

  await command({ args, expiresInHours, env });
}

// Only the file counts: process.loadEnvFile would let variables already exported in the shell win,
// and those may belong to another project's database.
function readEnvFile(path: string): Env {
  if (!existsSync(path)) {
    fail(`No env file at ${path}. Copy .env.instance.example to .env.instance and fill it in.`);
  }
  return parseEnv(readFileSync(path, "utf8"));
}

async function migrateDatabase({ env }: Options) {
  const client = postgres(requireEnv(env, "DATABASE_URL"), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL("../db/migrations", import.meta.url)),
    });
  } finally {
    await client.end();
  }
  console.log("The database is up to date.");
}

async function invite({ expiresInHours, env }: Options) {
  const inviteCode = await createInviteCode(adminClient(env), expiresInHours);
  printConnectQr(env, { instance: instanceFromEnv(env), inviteCode });
  console.log(`Single use; expires in ${expiresInHours} hours.`);
}

function link({ env }: Options) {
  printConnectQr(env, { instance: instanceFromEnv(env), inviteCode: null });
  console.log("Anyone with this link can reach the sign-in screen, but still needs a password.");
}

async function resetPassword({ args: [email], env }: Options) {
  if (!email) fail("Usage: pnpm instance reset-password <email>");

  const admin = adminClient(env);
  const user = await findUserByEmail(admin, email);
  const password = randomBytes(12).toString("base64url");
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) fail(`Could not reset the password: ${error.message}`);

  console.log(`Temporary password for ${email}: ${password}`);
  console.log("They can change it from their profile after signing in.");
}

function printConnectQr(env: Env, request: ConnectRequest) {
  const url = buildConnectLink(requireEnv(env, "APP_URL"), request);
  qrcode.generate(url, { small: true });
  console.log(url);
}

async function findUserByEmail(admin: ReturnType<typeof adminClient>, email: string) {
  // One page is plenty: an instance holds a single family.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) fail(`Could not list users: ${error.message}`);
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) fail(`No user with email ${email}.`);
  return user;
}

function adminClient(env: Env) {
  return createClient<Database>(
    requireEnv(env, "SUPABASE_URL"),
    requireEnv(env, "SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function instanceFromEnv(env: Env) {
  return {
    supabaseUrl: requireEnv(env, "SUPABASE_URL"),
    publishableKey: requireEnv(env, "SUPABASE_PUBLISHABLE_KEY"),
  };
}

function requireEnv(env: Env, name: string): string {
  const value = env[name];
  if (!value) fail(`${name} is not set. Add it to your env file (see .env.instance.example).`);
  return value;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
