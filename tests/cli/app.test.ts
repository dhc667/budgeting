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
  uniqueName,
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
    expect(json(app(["whoami", "--json", "user_id,email,display_name"]))).toEqual({
      user_id: userId,
      email,
      display_name: "Ana",
    });

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
  let ana: Awaited<ReturnType<typeof existingUser>>;

  beforeEach(async () => {
    ana = await existingUser("Ana");
    login(ana.email);
  });

  it("records transactions by name that the user then sees in the app, with balances to match", async () => {
    added(["accounts", "add", "--name", "Cash", "--currency", "USD"]);
    added(["accounts", "add", "--name", "Bank", "--currency", "USD"]);
    added(["categories", "add", "--name", "Food", "--kind", "expense"]);
    added(["categories", "add", "--name", "Lunch", "--kind", "expense", "--parent", "food"]);
    added(["categories", "add", "--name", "Pay", "--kind", "income"]);

    added(
      ["transactions", "add", "--type", "income", "--account", "Bank", "--amount", "100"].concat([
        "--category",
        "Pay",
        "--date",
        "2026-10-01",
      ]),
    );
    added(
      ["transactions", "add", "--type", "transfer", "--account", "bank"].concat([
        "--to-account",
        "CASH",
        "--amount",
        "30",
        "--date",
        "2026-10-02",
      ]),
    );
    const lunch = added(
      ["transactions", "add", "--type", "expense", "--account", "Cash"].concat([
        "--amount",
        "12.50",
        "--category",
        "Food/Lunch",
        "--title",
        "Lunch",
      ]),
    );

    expect(
      json(app(["transactions", "show", lunch, "--json", "type,title,amount,account,category"])),
    ).toEqual({
      type: "expense",
      title: "Lunch",
      amount: 12.5,
      account: "Cash",
      category: "Food/Lunch",
    });
    const user = await signedInAs(ana.email);
    const { data: seen } = await user.from("transaction_details").select("from_amount, title");
    expect(seen).toContainEqual({ from_amount: 1250, title: "Lunch" });
    expect(balances()).toEqual({ Cash: 17.5, Bank: 70 });
    expect(json(app(["transactions", "list", "--account", "Cash", "--json", "type"]))).toEqual([
      { type: "expense" },
      { type: "transfer" },
    ]);
  });

  it("takes as many decimals as the currency has, and no more", () => {
    added(["accounts", "add", "--name", "Cash", "--currency", "USD"]);
    added(["accounts", "add", "--name", "Yen", "--currency", "JPY", "--opening-amount", "1250"]);
    added(["categories", "add", "--name", "Food", "--kind", "expense"]);
    const expense = (account: string, amount: string) =>
      app(
        ["transactions", "add", "--type", "expense", "--account", account].concat([
          `--amount=${amount}`,
          "--category",
          "Food",
        ]),
      );

    const refusals = [
      expense("Cash", "12.505"),
      expense("Yen", "12.5"),
      expense("Cash", "-5"),
    ].concat([expense("Cash", "0"), expense("Cash", "12,50")]);

    expect(refusals.map(({ stderr }) => stderr.trim())).toEqual([
      "--amount: USD has 2 decimals, and 12.505 has more.",
      "--amount: JPY has 0 decimals, and 12.5 has more.",
      "--amount must be an amount in USD, like 12.50.",
      "--amount must be above zero.",
      "--amount must be an amount in USD, like 12.50.",
    ]);
    expect(balances()).toEqual({ Cash: 0, Yen: 1250 });
    expect(app(["transactions", "list", "--limit", "0"]).stderr).toContain(
      "--limit must be a whole number above zero",
    );
  });

  it("puts accounts and categories in the user's private space unless told otherwise", async () => {
    const cash = json(
      app(["accounts", "add", "--name", "Cash", "--currency", "USD", "--json", "space_id,space"]),
    );

    const space = await privateSpaceOf({ client: await signedInAs(ana.email), userId: ana.userId });
    expect(cash).toEqual({ space_id: space.id, space: "Private" });
  });

  it("creates a space the user can move money into with a transfer", () => {
    const family = uniqueName("Family");
    const familyId = added(["spaces", "add", "--name", family]);
    added(["accounts", "add", "--name", "Cash", "--currency", "USD", "--opening-amount", "50"]);
    added(["accounts", "add", "--space", family, "--name", "Joint", "--currency", "USD"]);

    added(
      ["transactions", "add", "--type", "transfer", "--account", "Cash"].concat([
        "--to-account",
        "Joint",
        "--amount",
        "50",
      ]),
    );

    expect(json(app(["spaces", "list", "--json", "id,name,private"]))).toContainEqual({
      id: familyId,
      name: family,
      private: false,
    });
    expect(balances(family)).toEqual({ Joint: 50 });
    expect(balances()).toEqual({ Cash: 0 });
  });

  it("refuses an account more than one space has by that name, listing them", () => {
    const family = uniqueName("Family");
    added(["spaces", "add", "--name", family]);
    const mine = added(["accounts", "add", "--name", "Cash", "--currency", "USD"]);
    const shared = added([
      "accounts",
      "add",
      "--space",
      family,
      "--name",
      "cash",
      "--currency",
      "USD",
    ]);

    const run = app(
      ["transactions", "add", "--type", "transfer", "--account", "Cash"].concat([
        "--to-account",
        shared,
        "--amount",
        "5",
      ]),
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("--account: Cash could be any of these");
    expect(run.stderr).toContain(`Cash in Private (${mine.slice(0, 8)})`);
    expect(run.stderr).toContain(`cash in ${family} (${shared.slice(0, 8)})`);
  });

  it("takes the start of an id in place of the whole of it", () => {
    added(["accounts", "add", "--name", "Cash", "--currency", "USD"]);
    added(["categories", "add", "--name", "Food", "--kind", "expense"]);
    const lunch = added(
      ["transactions", "add", "--type", "expense", "--account", "Cash"].concat([
        "--amount",
        "12.50",
        "--category",
        "Food",
        "--title",
        "Lunch",
      ]),
    );
    added(["transactions", "update", lunch.slice(0, 8), "--amount", "15"]);

    expect(json(app(["transactions", "show", lunch, "--json", "amount"]))).toEqual({ amount: 15 });
    expect(app(["transactions", "show", lunch.slice(0, 7)]).stderr).toContain(
      "at least its first 8 characters",
    );
  });

  it("lists the fields --json can print, and prints just those asked for", () => {
    const fields = app(["accounts", "add", "--name", "Cash", "--currency", "USD", "--json"]);

    expect(fields.stdout.split("\n")).toEqual(expect.arrayContaining(["id", "balance", "space"]));
    expect(json(app(["accounts", "list", "--json", "name"]))).toEqual([]);
    added(["accounts", "add", "--name", "Cash", "--currency", "USD"]);
    expect(json(app(["accounts", "list", "--json", "name,opening_date,balance"]))).toEqual([
      { name: "Cash", opening_date: null, balance: 0 },
    ]);
    expect(app(["accounts", "list", "--json", "nme"]).stderr).toContain("Unknown --json field nme");
  });

  it("prints tab-separated lines with a header row when piped", () => {
    const cash = added(
      ["accounts", "add", "--name", "Cash", "--currency", "USD"].concat([
        "--opening-amount",
        "1234.5",
      ]),
    );

    const lines = app(["accounts", "list"]).stdout.trim().split("\n");

    expect(lines).toEqual([
      "id\tspace\tname\tbalance\tarchived",
      `${cash.slice(0, 8)}\tPrivate\tCash\t1234.50 USD\tfalse`,
    ]);
  });

  it("prints only the id with --quiet, and nothing for a delete", () => {
    const run = app(["accounts", "add", "--name", "Cash", "--currency", "USD", "--quiet"]);

    expect(run.stdout).toMatch(/^[0-9a-f-]{36}\n$/);
    const deleted = app(["accounts", "delete", run.stdout.trim(), "--quiet"]);
    expect([deleted.status, deleted.stdout]).toEqual([0, ""]);
  });

  it("lends to a counterparty and lists what it still owes", () => {
    added(["accounts", "add", "--name", "Cash", "--currency", "USD", "--opening-amount", "50"]);
    added(["counterparties", "add", "--name", "Charlie"]);

    added(
      ["transactions", "add", "--type", "given", "--account", "Cash"].concat([
        "--counterparty",
        "charlie",
        "--amount",
        "30",
      ]),
    );
    added(
      ["transactions", "add", "--type", "received", "--account", "Cash"].concat([
        "--counterparty",
        "Charlie",
        "--amount",
        "10",
      ]),
    );

    expect(json(app(["counterparties", "list", "--json", "name,owed"]))).toEqual([
      { name: "Charlie", owed: { USD: 20 } },
    ]);
    expect(balances()).toEqual({ Cash: 30 });
  });

  it("pays a debt back in another currency, and changes what it took off the debt", () => {
    added(["accounts", "add", "--name", "Cash", "--currency", "USD", "--opening-amount", "50"]);
    added(["accounts", "add", "--name", "Euros", "--currency", "EUR"]);
    added(["counterparties", "add", "--name", "Charlie"]);
    added(
      ["transactions", "add", "--type", "given", "--account", "Cash"].concat([
        "--counterparty",
        "Charlie",
        "--amount",
        "30",
      ]),
    );

    const paidBack = added(
      ["transactions", "add", "--type", "received", "--account", "Euros"]
        .concat(["--counterparty", "Charlie", "--amount", "27", "--debt-currency", "USD"])
        .concat(["--debt-amount", "30"]),
    );
    expect(json(app(["counterparties", "list", "--json", "owed"]))).toEqual([{ owed: { USD: 0 } }]);

    const changed = json(
      app(
        ["transactions", "update", paidBack, "--debt-amount", "25"].concat([
          "--json",
          "to_amount,to_currency,debt_amount,debt_currency",
        ]),
      ),
    );

    expect(changed).toEqual({
      to_amount: 27,
      to_currency: "EUR",
      debt_amount: 25,
      debt_currency: "USD",
    });
    expect(json(app(["counterparties", "list", "--json", "owed"]))).toEqual([{ owed: { USD: 5 } }]);
    expect(balances()).toEqual({ Cash: 20, Euros: 27 });
  });

  it("changes only what an update gives, keeping the rest", () => {
    added(["accounts", "add", "--name", "Cash", "--currency", "USD"]);
    added(["categories", "add", "--name", "Food", "--kind", "expense"]);
    const lunch = added(
      ["transactions", "add", "--type", "expense", "--account", "Cash"].concat([
        "--amount",
        "12.50",
        "--category",
        "Food",
        "--title",
        "Lunch",
        "--note",
        "with Bea",
      ]),
    );

    const changed = json(
      app(["transactions", "update", lunch, "--amount", "15", "--json", "amount,title,note"]),
    );

    expect(changed).toEqual({ amount: 15, title: "Lunch", note: "with Bea" });
    expect(
      json(app(["accounts", "update", "Cash", "--name", "Wallet", "--json", "name,currency"])),
    ).toEqual({ name: "Wallet", currency: "USD" });
  });

  it("deletes a transaction and brings it back", () => {
    added(["accounts", "add", "--name", "Cash", "--currency", "USD"]);
    added(["categories", "add", "--name", "Food", "--kind", "expense"]);
    const lunch = added(
      ["transactions", "add", "--type", "expense", "--account", "Cash"].concat([
        "--amount",
        "12.50",
        "--category",
        "Food",
      ]),
    );

    expect(app(["transactions", "delete", lunch]).stdout).toBe(
      `Deleted transaction ${lunch.slice(0, 8)}.\n`,
    );
    expect(app(["transactions", "show", lunch]).status).toBe(1);

    expect(app(["transactions", "restore", lunch.slice(0, 8), "--quiet"]).stdout).toBe(
      `${lunch}\n`,
    );
  });

  it("moves a deleted category's transactions to the one given", () => {
    added(["accounts", "add", "--name", "Cash", "--currency", "USD"]);
    added(["categories", "add", "--name", "Food", "--kind", "expense"]);
    added(["categories", "add", "--name", "Produce", "--kind", "expense"]);
    const lunch = added(
      ["transactions", "add", "--type", "expense", "--account", "Cash"].concat([
        "--amount",
        "12.50",
        "--category",
        "Food",
      ]),
    );

    app(["categories", "delete", "Food", "--move-to", "Produce"]);

    expect(json(app(["transactions", "show", lunch, "--json", "category"]))).toEqual({
      category: "Produce",
    });
  });

  it("lists archived accounts only when asked to", () => {
    added(["accounts", "add", "--name", "Cash", "--currency", "USD"]);

    app(["accounts", "archive", "Cash"]);

    expect(json(app(["accounts", "list", "--json", "name"]))).toEqual([]);
    expect(json(app(["accounts", "list", "--archived", "--json", "name"]))).toEqual([
      { name: "Cash" },
    ]);
  });

  it("can't name a space the user isn't in", async () => {
    const owner = await existingUser("Bea");
    const ownerSpace = await privateSpaceOf({
      client: await signedInAs(owner.email),
      userId: owner.userId,
    });

    const run = app(
      ["accounts", "add", "--space", ownerSpace.id, "--name", "Mine now"].concat([
        "--currency",
        "USD",
      ]),
    );

    expect(run.stderr).toContain("--space: nothing is called");
    expect(run.status).toBe(1);
    const { data } = await (await signedInAs(owner.email)).from("accounts").select("name");
    expect(data).toEqual([]);
  });
});

function login(email: string) {
  return app(["login", "--email", email, "--password-stdin"], `${password}\n`);
}

function app(args: string[], input = "") {
  return spawnSync("node", ["cli/app.ts", ...args, "--env", envFile], {
    encoding: "utf8",
    input,
  });
}

// Runs an add or update, and gives back the id of what it wrote.
function added(args: string[]): string {
  const run = app([...args, "--quiet"]);
  if (run.status !== 0) throw new Error(`pnpm app failed: ${run.stderr}`);
  return run.stdout.trim();
}

function balances(space?: string): Record<string, number> {
  const args = ["accounts", "list", "--json", "name,balance", ...(space ? ["--space", space] : [])];
  const accounts = z
    .array(z.object({ name: z.string(), balance: z.number() }))
    .parse(json(app(args)));
  return Object.fromEntries(accounts.map((a) => [a.name, a.balance]));
}

function json(run: ReturnType<typeof app>): unknown {
  if (run.status !== 0) throw new Error(`pnpm app failed: ${run.stderr}`);
  return JSON.parse(run.stdout);
}
