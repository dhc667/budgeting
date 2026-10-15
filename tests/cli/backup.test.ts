import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrationCount } from "../../db/migration-count.ts";
import { existingUser, sql } from "../support/local-instance.ts";

const cli = resolve("cli/instance.ts");
const localEnv = resolve(".env.instance.local");
const localUrl = new URL(process.env.DATABASE_URL ?? "");
const scratchName = `restore_test_${Date.now()}`;
const scratchUrl = withDatabase(scratchName);
let folder: string;
let scratchEnv: string;
let scratch: ReturnType<typeof postgres>;
let ana: { email: string; userId: string };
let backupFile: string;

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "backup-test-"));
  scratchEnv = join(folder, "scratch.env");
  writeFileSync(scratchEnv, `DATABASE_URL=${scratchUrl}\n`);

  await sql.unsafe(`create database ${scratchName}`);
  scratch = postgres(scratchUrl, { max: 1, onnotice: () => {} });
  giveFreshProjectShape();

  ana = await existingUser("Ana Backup");
  await sql`update profiles set language = 'es-419' where id = ${ana.userId}`;
  const run = instanceCli(["backup", "--env", localEnv], { cwd: folder });
  expect(run.status, run.stderr).toBe(0);
  backupFile = join(folder, readdirSync(folder).filter((f) => f.endsWith(".sql"))[0] ?? "");
});

afterAll(async () => {
  await scratch.end();
  await sql.unsafe(`drop database if exists ${scratchName} with (force)`);
  await sql.end();
  rmSync(folder, { recursive: true, force: true });
});

describe("backup", () => {
  it("writes a dated file and never overwrites an earlier one", () => {
    const again = instanceCli(["backup", "--env", localEnv], { cwd: folder });

    expect(again.status, again.stderr).toBe(0);
    const files = readdirSync(folder).filter((f) => f.endsWith(".sql"));
    expect(files).toHaveLength(2);
    expect(files.every((f) => /^backup-\d{4}-\d{2}-\d{2}(-\d+)?\.sql$/.test(f))).toBe(true);
  });

  it("reports a missing env file", () => {
    const run = instanceCli(["backup", "--env", "missing.env"], { cwd: folder });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("No env file at missing.env");
  });

  it("reports an unreachable database without printing its URL", () => {
    const env = join(folder, "unreachable.env");
    writeFileSync(env, "DATABASE_URL=postgresql://postgres:s3cret-pw@127.0.0.1:1/postgres\n");

    const run = instanceCli(["backup", "--env", env], { cwd: folder });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("psql failed");
    expect(run.stderr + run.stdout).not.toContain("s3cret-pw");
  });

  it("reports missing Postgres tools", () => {
    const run = instanceCli(["backup", "--env", localEnv], {
      cwd: folder,
      env: { PATH: "" },
      node: process.execPath,
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("is not installed");
  });
});

describe("restore", () => {
  it("refuses an instance that already has users or tables", () => {
    const run = instanceCli(["restore", backupFile, "--env", localEnv], { cwd: folder });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("restore needs a fresh project");
    expect(run.stderr).toContain("do not run migrate");
  });

  it("refuses a backup from a newer version of the app", () => {
    const newer = join(folder, "newer.sql");
    const header = `-- Budgeting backup at schema version ${migrationCount()}`;
    const bumped = readFileSync(backupFile, "utf8").replace(
      header,
      `-- Budgeting backup at schema version ${migrationCount() + 1}`,
    );
    writeFileSync(newer, bumped);

    const run = instanceCli(["restore", newer, "--env", scratchEnv], { cwd: folder });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Update the app first");
  });

  it("refuses a file that isn't a backup from this tool", () => {
    const other = join(folder, "other.sql");
    writeFileSync(other, "select 1;\n");

    const run = instanceCli(["restore", other, "--env", scratchEnv], { cwd: folder });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("not a backup made by this tool");
  });

  it("loads a backup into a fresh project and brings it up to the current schema", async () => {
    const run = instanceCli(["restore", backupFile, "--env", scratchEnv], { cwd: folder });

    expect(run.status, run.stderr).toBe(0);
    const [user] = await scratch`select email from auth.users where id = ${ana.userId}`;
    expect(user).toEqual({ email: ana.email });
    const [profile] =
      await scratch`select display_name, language from profiles where id = ${ana.userId}`;
    expect(profile).toEqual({ display_name: "Ana Backup", language: "es-419" });
    const [row] = await scratch`select schema_version() as version`;
    expect(row?.version).toBe(migrationCount());
  });
});

function instanceCli(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; node?: string },
) {
  return spawnSync(options.node ?? "node", [cli, ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
}

function withDatabase(name: string): string {
  const url = new URL(localUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function giveFreshProjectShape() {
  const auth = spawnSync(
    "pg_dump",
    ["--schema-only", "--no-owner", "--no-privileges", "--schema=auth", localUrl.toString()],
    { encoding: "utf8", maxBuffer: 1024 ** 3 },
  );
  expect(auth.status, auth.stderr).toBe(0);
  const load = spawnSync("psql", ["--quiet", "--variable=ON_ERROR_STOP=1", scratchUrl], {
    input: withoutAppTriggers(auth.stdout),
    encoding: "utf8",
  });
  expect(load.status, load.stderr).toBe(0);
}

// The local auth schema carries this app's own trigger, which a fresh project doesn't have yet.
function withoutAppTriggers(dump: string): string {
  return dump
    .split("\n")
    .filter((line) => !line.includes("public.redeem_invite_code()"))
    .join("\n");
}
