import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import qrcode from "qrcode-terminal";
import { migrationCount } from "../db/migration-count.ts";
import { buildConnectLink, type ConnectRequest } from "../src/instance/connect-link.ts";
import type { Database } from "../src/supabase/database.ts";
import * as z from "zod";
import { ImportError, importFile, importIntoPrivateSpace } from "./import.ts";
import { createInviteCode } from "./invites.ts";
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
                              user's private space (the format is in cli/import.ts)
  load-rates <file>           Replace a currency's exchange rates with the ones in a JSON file;
                              the app stops fetching that currency's (the format is in cli/rates.ts)

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
  backup,
  restore,
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

async function migrateDatabase({ env }: Options, migrationsFolder = appMigrationsFolder()) {
  const client = postgres(requireEnv(env, "DATABASE_URL"), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
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
  if (!email) fail("Usage: pnpm run instance reset-password <email>");

  const admin = adminClient(env);
  const user = await findUserByEmail(admin, email);
  const password = randomBytes(12).toString("base64url");
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) fail(`Could not reset the password: ${error.message}`);

  console.log(`Temporary password for ${email}: ${password}`);
  console.log("They can change it from their profile after signing in.");
}

function backup({ env }: Options) {
  const connection = connectionFromEnv(env);
  const version = runTool(
    "psql",
    ["--no-align", "--tuples-only", "--command=select public.schema_version()"],
    connection,
  ).trim();
  // Data only: the migrations rebuild the structure, so the backup can't drift from them.
  const data = runTool(
    "pg_dump",
    [
      "--data-only",
      "--no-owner",
      "--table=auth.users",
      "--table=auth.identities",
      "--table=public.*",
    ],
    connection,
  );

  const path = writeNewFile(`-- Budgeting backup at schema version ${version}\n${data}`);
  console.log(`Backup saved to ${path}.`);
  console.log("It holds everyone's data and password hashes: keep it somewhere safe.");
}

async function restore(options: Options) {
  const [file] = options.args;
  if (!file) fail("Usage: pnpm run instance restore <file>");
  if (!existsSync(file)) fail(`No backup file at ${file}.`);

  const version = readBackupVersion(file);
  if (version > migrationCount()) {
    fail(
      `${file} is from a newer version of the app (schema version ${version}). Update the app first.`,
    );
  }
  const connection = connectionFromEnv(options.env);
  await refuseUnlessFresh(requireEnv(options.env, "DATABASE_URL"));

  await migrateToVersion(options, version);
  runTool(
    "psql",
    [
      "--single-transaction",
      "--variable=ON_ERROR_STOP=1",
      "--quiet",
      "--command=SET session_replication_role = replica",
      `--command=${emptyAppTables()}`,
      `--file=${file}`,
    ],
    connection,
    "The project now has a schema but no data, so it is no longer fresh. Create a new project " +
      "(or reset the local one) and restore again.",
  );
  console.log(`Loaded ${file}.`);
  await migrateDatabase(options);
}

async function importTransactions({ args: [email, file], env }: Options) {
  if (!email || !file) fail("Usage: pnpm run instance import <email> <file>");
  const data = readJsonFile(file, importFile, "the import format");

  const client = postgres(requireEnv(env, "DATABASE_URL"), { max: 1, onnotice: () => {} });
  try {
    const accounts = await importIntoPrivateSpace(client, email, data);
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
    fail(`Nothing was loaded: ${error instanceof Error ? error.message : String(error)}`);
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

function readBackupVersion(file: string): number {
  const header = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";
  const match = /^-- Budgeting backup at schema version (\d+)\s*$/.exec(header);
  if (!match?.[1]) fail(`${file} is not a backup made by this tool: its first line is missing.`);
  return Number(match[1]);
}

async function refuseUnlessFresh(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const [counts] = await client<{ users: number; tables: number }[]>`
      select
        (select count(*)::integer from auth.users) as users,
        (select count(*)::integer from information_schema.tables
          where table_schema in ('public', 'drizzle')) as tables`;
    if (!counts || counts.users > 0 || counts.tables > 0) {
      fail(
        "This database is not fresh, and a restore needs a fresh project. Create a new Supabase " +
          "project and do not run migrate before restoring: the restore applies the migrations itself.",
      );
    }
  } catch (error) {
    return fail(`Could not reach the database: ${describeError(error)}`);
  } finally {
    await client.end();
  }
}

// The migrator has no target version, but it applies exactly the journal's entries.
async function migrateToVersion(options: Options, version: number) {
  const folder = mkdtempSync(join(tmpdir(), "migrations-"));
  try {
    cpSync(appMigrationsFolder(), folder, { recursive: true });
    const journalPath = join(folder, "meta", "_journal.json");
    const journal: unknown = JSON.parse(readFileSync(journalPath, "utf8"));
    if (typeof journal !== "object" || !journal || !("entries" in journal)) {
      return fail("The migrations journal has no entries list.");
    }
    const entries = Array.isArray(journal.entries) ? journal.entries.slice(0, version) : [];
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries }));
    await migrateDatabase(options, folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function appMigrationsFolder(): string {
  return fileURLToPath(new URL("../db/migrations", import.meta.url));
}

// Migrations seed rows of their own (currencies); the backup's copy of them is the one that counts.
function emptyAppTables(): string {
  return `DO $$ BEGIN
    EXECUTE (SELECT 'TRUNCATE ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
      FROM pg_tables WHERE schemaname = 'public');
  END $$`;
}

function writeNewFile(contents: string): string {
  const date = new Date().toISOString().slice(0, 10);
  for (let n = 1; ; n++) {
    const path = n === 1 ? `backup-${date}.sql` : `backup-${date}-${n}.sql`;
    try {
      writeFileSync(path, contents, { flag: "wx" });
      return path;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
  }
}

function runTool(
  tool: "pg_dump" | "psql",
  args: string[],
  connection: Connection,
  afterFailure = "",
): string {
  const run = spawnSync(tool, args, {
    encoding: "utf8",
    env: { ...withoutPgVariables(process.env), ...connection },
    maxBuffer: 1024 ** 3,
  });
  if (run.error && "code" in run.error && run.error.code === "ENOENT") {
    fail(
      `${tool} is not installed. Install the PostgreSQL client tools (they include pg_dump and psql).`,
    );
  }
  if (run.error) fail(`Could not run ${tool}: ${run.error.message}`);
  if (run.status !== 0) {
    fail(`${tool} failed:\n${run.stderr.trim()}\n${afterFailure}`.trim());
  }
  return run.stdout;
}

// libpq reads these from the environment, which keeps the password out of the process list and
// out of any message.
function connectionFromEnv(env: Env): Connection {
  const url = new URL(requireEnv(env, "DATABASE_URL"));
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get("sslmode") ?? "prefer",
  };
}

// Only the env file counts, so a PGHOST exported for another project can't redirect the tools.
function withoutPgVariables(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith("PG")));
}

function describeError(error: unknown): string {
  if (error instanceof Error && "code" in error) return String(error.code);
  return messageOf(error);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

type Connection = Record<
  "PGHOST" | "PGPORT" | "PGUSER" | "PGPASSWORD" | "PGDATABASE" | "PGSSLMODE",
  string
>;
