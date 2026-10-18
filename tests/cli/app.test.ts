import { spawnSync } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import * as z from "zod";
import {
  existingUser,
  instance,
  password,
  privateSpaceOf,
  signedInAs,
} from "../support/local-instance";

let envFile: string;

beforeEach(() => {
  envFile = join(mkdtempSync(join(tmpdir(), "app-cli-")), ".env.instance");
  writeFileSync(
    envFile,
    `SUPABASE_URL=${instance.supabaseUrl}\nSUPABASE_PUBLISHABLE_KEY=${instance.publishableKey}\n`,
  );
});

describe("signing in to the app CLI", () => {
  it("keeps a session that later commands use, until logout", async () => {
    const { email, userId } = await existingUser("Ana");

    expect(login(email).status).toBe(0);
    expect(json(app(["whoami"]))).toMatchObject({ userId, email, displayName: "Ana" });

    expect(app(["logout"]).status).toBe(0);
    const after = app(["whoami"]);
    expect(after.stderr).toContain("Not signed in");
    expect(after.status).toBe(1);
  });

  it("keeps the session where only the user can read it", async () => {
    const { email } = await existingUser("Ana");

    login(email);

    expect(statSync(`${envFile}.session`).mode & 0o777).toBe(0o600);
  });

  it("signs nobody in with a wrong password", async () => {
    const { email } = await existingUser("Ana");

    const run = app(["login", "--email", email, "--password-stdin"], "not the password");

    expect(run.stderr).toContain("Could not sign in");
    expect(run.status).toBe(1);
    expect(app(["whoami"]).status).toBe(1);
  });
});

describe("the app CLI, signed in", () => {
  it("records transactions the user then sees in the app, with balances to match", async () => {
    const { email } = await existingUser("Ana");
    login(email);
    const cash = idOf(app(["accounts", "add", "--name", "Cash", "--currency", "USD"]));
    const bank = idOf(app(["accounts", "add", "--name", "Bank", "--currency", "USD"]));
    const food = idOf(app(["categories", "add", "--name", "Food", "--kind", "expense"]));

    app([
      "transactions",
      "add",
      "--type",
      "income",
      "--account",
      bank,
      "--amount",
      "10000",
      "--category",
      idOf(app(["categories", "add", "--name", "Pay", "--kind", "income"])),
      "--date",
      "2026-10-01",
    ]);
    app([
      "transactions",
      "add",
      "--type",
      "transfer",
      "--account",
      bank,
      "--to-account",
      cash,
      "--amount",
      "3000",
      "--date",
      "2026-10-02",
    ]);
    const lunch = idOf(
      app([
        "transactions",
        "add",
        "--type",
        "expense",
        "--account",
        cash,
        "--amount",
        "1250",
        "--category",
        food,
        "--title",
        "Lunch",
        "--date",
        "2026-10-03",
      ]),
    );

    expect(json(app(["transactions", "show", lunch]))).toMatchObject({
      type: "expense",
      title: "Lunch",
      from_amount: 1250,
    });
    const user = await signedInAs(email);
    const { data: seen } = await user.from("transaction_details").select("id, title");
    expect(seen).toContainEqual({ id: lunch, title: "Lunch" });
    expect(balances(app(["accounts", "list"]))).toEqual({ Cash: 1750, Bank: 7000 });
    expect(
      z
        .array(z.object({ type: z.string() }))
        .parse(json(app(["transactions", "list", "--account", cash])))
        .map((t) => t.type),
    ).toEqual(["expense", "transfer"]);
  });

  it("puts accounts and categories in the user's private space unless told otherwise", async () => {
    const { email, userId } = await existingUser("Ana");
    login(email);

    const cash = json(app(["accounts", "add", "--name", "Cash", "--currency", "USD"]));

    const space = await privateSpaceOf({ client: await signedInAs(email), userId });
    expect(cash).toMatchObject({ space_id: space.id });
  });

  it("creates a space the user can move money into with a transfer", async () => {
    const { email } = await existingUser("Ana");
    login(email);
    const family = idOf(app(["spaces", "add", "--name", "Family"]));
    const cash = idOf(
      app(["accounts", "add", "--name", "Cash", "--currency", "USD", "--opening-amount", "5000"]),
    );
    const shared = idOf(
      app(["accounts", "add", "--space", family, "--name", "Cash", "--currency", "USD"]),
    );

    app([
      "transactions",
      "add",
      "--type",
      "transfer",
      "--account",
      cash,
      "--to-account",
      shared,
      "--amount",
      "5000",
    ]);

    expect(json(app(["spaces", "list"]))).toContainEqual({
      id: family,
      name: "Family",
      private: false,
    });
    expect(json(app(["accounts", "list", "--space", family]))).toMatchObject([{ balance: 5000 }]);
    expect(json(app(["accounts", "list"]))).toMatchObject([{ balance: 0 }, { balance: 5000 }]);
  });

  it("changes only what an update gives, keeping the rest", async () => {
    const { email } = await existingUser("Ana");
    login(email);
    const { cash, food } = cashAndFood();
    const lunch = idOf(
      app([
        "transactions",
        "add",
        "--type",
        "expense",
        "--account",
        cash,
        "--amount",
        "1250",
        "--category",
        food,
        "--title",
        "Lunch",
        "--note",
        "with Bea",
      ]),
    );

    const changed = json(app(["transactions", "update", lunch, "--amount", "1500"]));

    expect(changed).toMatchObject({ from_amount: 1500, title: "Lunch", note: "with Bea" });
    expect(json(app(["accounts", "update", cash, "--name", "Wallet"]))).toMatchObject({
      name: "Wallet",
      currency: "USD",
    });
  });

  it("deletes a transaction and brings it back", async () => {
    const { email } = await existingUser("Ana");
    login(email);
    const { cash, food } = cashAndFood();
    const lunch = idOf(
      app([
        "transactions",
        "add",
        "--type",
        "expense",
        "--account",
        cash,
        "--amount",
        "1250",
        "--category",
        food,
      ]),
    );

    app(["transactions", "delete", lunch]);
    expect(app(["transactions", "show", lunch]).status).toBe(1);

    expect(json(app(["transactions", "restore", lunch]))).toMatchObject({ id: lunch });
  });

  it("moves a deleted category's transactions to the one given", async () => {
    const { email } = await existingUser("Ana");
    login(email);
    const { cash, food } = cashAndFood();
    const groceries = idOf(app(["categories", "add", "--name", "Groceries", "--kind", "expense"]));
    const lunch = idOf(
      app([
        "transactions",
        "add",
        "--type",
        "expense",
        "--account",
        cash,
        "--amount",
        "1250",
        "--category",
        food,
      ]),
    );

    app(["categories", "delete", food, "--move-to", groceries]);

    expect(json(app(["transactions", "show", lunch]))).toMatchObject({
      category_id: groceries,
    });
  });

  it("lists archived accounts only when asked to", async () => {
    const { email } = await existingUser("Ana");
    login(email);
    const { cash } = cashAndFood();

    app(["accounts", "archive", cash]);

    expect(json(app(["accounts", "list"]))).toEqual([]);
    expect(json(app(["accounts", "list", "--archived"]))).toMatchObject([{ id: cash }]);
  });

  it("can't touch a space the user isn't in", async () => {
    const owner = await existingUser("Ana");
    const ownerSpace = await privateSpaceOf({
      client: await signedInAs(owner.email),
      userId: owner.userId,
    });
    const { email } = await existingUser("Bea");
    login(email);

    const run = app([
      "accounts",
      "add",
      "--space",
      ownerSpace.id,
      "--name",
      "Mine now",
      "--currency",
      "USD",
    ]);

    expect(run.stderr).toContain("only a member of a space can add accounts to it");
    expect(run.status).toBe(1);
    const { data } = await (await signedInAs(owner.email)).from("accounts").select("name");
    expect(data).toEqual([]);
  });

  it("refuses a malformed amount before reaching the database", async () => {
    const { email } = await existingUser("Ana");
    login(email);
    const { cash, food } = cashAndFood();

    const run = app([
      "transactions",
      "add",
      "--type",
      "expense",
      "--account",
      cash,
      "--amount",
      "12.50",
      "--category",
      food,
    ]);

    expect(run.stderr).toContain("--amount must be a whole number of minor units");
    expect(run.status).toBe(1);
  });
});

function cashAndFood() {
  return {
    cash: idOf(app(["accounts", "add", "--name", "Cash", "--currency", "USD"])),
    food: idOf(app(["categories", "add", "--name", "Food", "--kind", "expense"])),
  };
}

function login(email: string) {
  return app(["login", "--email", email, "--password-stdin"], `${password}\n`);
}

function app(args: string[], input = "") {
  return spawnSync("node", ["cli/app.ts", ...args, "--env", envFile], {
    encoding: "utf8",
    input,
  });
}

function balances(run: ReturnType<typeof app>): Record<string, number> {
  const accounts = z.array(z.object({ name: z.string(), balance: z.number() })).parse(json(run));
  return Object.fromEntries(accounts.map((a) => [a.name, a.balance]));
}

function idOf(run: ReturnType<typeof app>): string {
  return z.object({ id: z.string() }).parse(json(run)).id;
}

function json(run: ReturnType<typeof app>): unknown {
  if (run.status !== 0) throw new Error(`pnpm app failed: ${run.stderr}`);
  return JSON.parse(run.stdout);
}
