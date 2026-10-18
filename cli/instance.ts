import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import qrcode from "qrcode-terminal";
import { buildConnectLink, type ConnectRequest } from "../src/instance/connect-link.ts";
import type { Database } from "../src/supabase/database.ts";
import * as z from "zod";
import { backup, restore } from "./backup.ts";
import { type Env, instanceFromEnv, readEnvFile, requireEnv } from "./env.ts";
import { fail, messageOf } from "./fail.ts";
import { ImportError, importFile, importIntoPrivateSpace } from "./import.ts";
import { createInviteCode } from "./invites.ts";
import { migrateDatabase } from "./migrate.ts";
import { loadRatesByHand, RatesError, ratesFile } from "./rates.ts";

const usage = `Usage: pnpm run instance <command> [--env <file>]

Commands:
  migrate                     Apply pending database migrations
  invite [--expires <hours>]  Print a one-time signup QR code (expires in 24 hours by default)
  link                        Print a QR code that connects a device to sign in, without an invite
  reset-password <email>      Give a user a temporary password
  backup                      Save the database to backup-<date>.sql in the current folder
  restore <file>              Load a backup into a fresh project, then migrate
  import <email> <file>       Add the accounts, categories and transactions in a JSON file to a
    [--replace-categories]    user's private space (the format is in cli/import.ts); with the
                              option, its categories first replace the space's, which no
                              transaction may be in yet
  load-rates <file>           Replace a currency's exchange rates with the ones in a JSON file;
                              the app stops fetching that currency's (the format is in cli/rates.ts)

Options:
  --env <file>                Instance settings (default: .env.instance; see .env.instance.example)
`;

type Options = { args: string[]; expiresInHours: number; replaceCategories: boolean; env: Env };

const commands: Record<string, (options: Options) => void | Promise<void>> = {
  migrate: ({ env }) => migrateDatabase(env),
  invite,
  link,
  "reset-password": resetPassword,
  backup: ({ env }) => backup(env),
  restore: ({ args: [file], env }) => {
    if (!file) fail("Usage: pnpm run instance restore <file>");
    return restore(env, file);
  },
  import: importTransactions,
  "load-rates": loadRates,
};

await main();

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      env: { type: "string", default: ".env.instance" },
      expires: { type: "string", default: "24" },
      "replace-categories": { type: "boolean", default: false },
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

  await command({ args, expiresInHours, replaceCategories: values["replace-categories"], env });
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
  if (!email) fail("Usage: pnpm run instance reset-password <email>");

  const admin = adminClient(env);
  const user = await findUserByEmail(admin, email);
  const password = randomBytes(12).toString("base64url");
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) fail(`Could not reset the password: ${error.message}`);

  console.log(`Temporary password for ${email}: ${password}`);
  console.log("They can change it from their profile after signing in.");
}

async function importTransactions({ args: [email, file], replaceCategories, env }: Options) {
  if (!email || !file) fail("Usage: pnpm run instance import <email> <file>");
  const data = readJsonFile(file, importFile, "the import format");

  const client = postgres(requireEnv(env, "DATABASE_URL"), { max: 1, onnotice: () => {} });
  try {
    const accounts = await importIntoPrivateSpace(client, email, data, { replaceCategories });
    console.log(`Imported ${data.transactions.length} transactions. Balances now:`);
    for (const { name, currency, balance, decimals } of accounts) {
      console.log(`  ${name}: ${(balance / 10 ** decimals).toFixed(decimals)} ${currency}`);
    }
  } catch (error) {
    if (error instanceof ImportError) fail(error.message);
    fail(`Nothing was imported: ${messageOf(error)}`);
  } finally {
    await client.end();
  }
}

async function loadRates({ args: [file], env }: Options) {
  if (!file) fail("Usage: pnpm run instance load-rates <file>");
  const data = readJsonFile(file, ratesFile, "the rates format");

  const client = postgres(requireEnv(env, "DATABASE_URL"), { max: 1, onnotice: () => {} });
  try {
    const loaded = await loadRatesByHand(client, data);
    console.log(
      `Loaded ${loaded.count} ${data.currency} rates, from ${loaded.from} to ${loaded.to}.`,
    );
    console.log(`The app no longer fetches ${data.currency} rates.`);
  } catch (error) {
    if (error instanceof RatesError) fail(error.message);
    fail(`Nothing was loaded: ${messageOf(error)}`);
  } finally {
    await client.end();
  }
}

function readJsonFile<T>(file: string, schema: z.ZodType<T>, format: string): T {
  if (!existsSync(file)) fail(`No file at ${file}.`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return fail(`${file} is not valid JSON: ${messageOf(error)}`);
  }
  const result = schema.safeParse(json);
  if (!result.success) fail(`${file} doesn't match ${format}:\n${z.prettifyError(result.error)}`);
  return result.data;
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
