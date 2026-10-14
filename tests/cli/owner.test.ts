import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function owner(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync("node", ["cli/owner.ts", ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("the owner CLI's settings", () => {
  it("come from the env file even when the shell exports the same names", () => {
    const run = owner(["migrate", "--env", ".env.owner.local"], {
      DATABASE_URL: "postgresql://someone-else@127.0.0.1:1/their_database",
    });

    expect(run.stdout).toContain("The database is up to date.");
    expect(run.status).toBe(0);
  });

  it("are refused when the env file doesn't exist", () => {
    const run = owner(["migrate", "--env", ".env.owner.missing"]);

    expect(run.stderr).toContain("No env file at .env.owner.missing");
    expect(run.status).toBe(1);
  });
});
