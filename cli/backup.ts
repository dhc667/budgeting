import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { migrationCount } from "../db/migration-count.ts";
import { type Env, requireEnv } from "./env.ts";
import { fail, messageOf } from "./fail.ts";
import { appMigrationsFolder, migrateDatabase } from "./migrate.ts";

export function backup(env: Env) {
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

export async function restore(env: Env, file: string) {
  if (!existsSync(file)) fail(`No backup file at ${file}.`);

  const version = readBackupVersion(file);
  if (version > migrationCount()) {
    fail(
      `${file} is from a newer version of the app (schema version ${version}). Update the app first.`,
    );
  }
  const connection = connectionFromEnv(env);
  await refuseUnlessFresh(requireEnv(env, "DATABASE_URL"));

  await migrateToVersion(env, version);
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
  await migrateDatabase(env);
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
async function migrateToVersion(env: Env, version: number) {
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
    await migrateDatabase(env, folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
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

type Connection = Record<
  "PGHOST" | "PGPORT" | "PGUSER" | "PGPASSWORD" | "PGDATABASE" | "PGSSLMODE",
  string
>;
