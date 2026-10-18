import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { existingUser, signedInAs } from "../support/local-instance";

describe("importing a file into a user's private space", () => {
  it("adds its accounts, categories and transactions, keeping each day's order", async () => {
    const { email } = await existingUser("Importer");

    const run = importFile(email, sampleFile());

    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("Imported 4 transactions.");
    expect(run.stdout).toContain("Cash USD: 76.50 USD");
    const user = await signedInAs(email);
    expect(await balances(user)).toEqual([
      { name: "Cash USD", currency: "USD", balance: 7650 },
      { name: "Bank EUR", currency: "EUR", balance: 1000 },
    ]);
    expect(await newestFirst(user)).toEqual([
      { date: "2025-01-02", type: "transfer", title: "To the bank" },
      { date: "2025-01-02", type: "refund", title: "Bus refund" },
      { date: "2025-01-02", type: "expense", title: "Lunch" },
      { date: "2025-01-01", type: "income", title: "Pay" },
    ]);
  });

  it("keeps the order the file lists a day's transactions in when it doesn't say when they were recorded", async () => {
    const { email } = await existingUser("Importer");
    const file = sampleFile();

    importFile(email, {
      ...file,
      transactions: ["Breakfast", "Lunch", "Dinner"].map((title) => ({
        type: "expense",
        date: "2025-01-02",
        title,
        account: "Cash USD",
        amount: 100,
        category: "Food",
      })),
    });

    expect((await signedInAs(email).then(newestFirst)).map((t) => t.title)).toEqual([
      "Dinner",
      "Lunch",
      "Breakfast",
    ]);
  });

  it("uses the categories the space already has, adding only the others", async () => {
    const { email } = await existingUser("Importer");

    importFile(email, sampleFile());

    const categories = await signedInAs(email).then(categoryNames);
    expect(categories.filter((c) => c === "income/Salary")).toHaveLength(1);
    expect(categories).toContain("expense/Food/Lunches");
  });

  it("replaces the space's categories with the file's when asked", async () => {
    const { email } = await existingUser("Importer");

    const run = importFile(email, sampleFile(), ["--replace-categories"]);

    expect(run.stderr).toBe("");
    expect((await signedInAs(email).then(categoryNames)).sort()).toEqual([
      "expense/Food",
      "expense/Food/Lunches",
      "expense/Transport",
      "expense/debts_forgiven",
      "income/Salary",
      "income/debts_forgiven_to_you",
    ]);
  });

  it("won't replace categories that transactions are already in", async () => {
    const { email } = await existingUser("Importer");
    importFile(email, sampleFile());
    const before = await signedInAs(email).then(categoryNames);
    const file = sampleFile();

    const run = importFile(
      email,
      {
        ...file,
        accounts: file.accounts.map((a) => ({ ...a, name: `New ${a.name}` })),
        transactions: [],
      },
      ["--replace-categories"],
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Food › Lunches, Transport, Salary have transactions");
    expect(await signedInAs(email).then(categoryNames)).toEqual(before);
  });

  it("refuses a file that doesn't match the format, saying where", async () => {
    const { email } = await existingUser("Importer");
    const file = sampleFile();
    const run = importFile(email, {
      ...file,
      transactions: file.transactions.map((t, i) => (i === 0 ? { ...t, account: "Wallet" } : t)),
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('No account named "Wallet" in the file');
    expect(run.stderr).toContain("transactions[0]");
    expect(await signedInAs(email).then(balances)).toEqual([]);
  });

  it("refuses a category listed twice and an amount received within one currency", async () => {
    const { email } = await existingUser("Importer");
    const file = sampleFile();
    const run = importFile(email, {
      ...file,
      accounts: [...file.accounts, { name: "Savings USD", currency: "USD", color: "teal" }],
      categories: [
        ...file.categories,
        { kind: "expense", name: "Transport", icon: "car", color: "red" },
      ],
      transactions: [
        {
          type: "transfer",
          date: "2025-01-02",
          account: "Cash USD",
          amount: 1000,
          toAccount: "Savings USD",
          toAmount: 900,
        },
      ],
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("The expense category Transport repeats");
    expect(run.stderr).toContain("categories[3]");
    expect(run.stderr).toContain("toAmount isn't amount");
    expect(await signedInAs(email).then(balances)).toEqual([]);
  });

  it("saves nothing when a transaction breaks one of the app's rules", async () => {
    const { email } = await existingUser("Importer");
    const file = sampleFile();
    const run = importFile(email, {
      ...file,
      transactions: file.transactions.map((t, i) => (i === 3 ? { ...t, date: "2999-01-01" } : t)),
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      "Nothing was imported: a transaction can't be dated in the future",
    );
    expect(await signedInAs(email).then(balances)).toEqual([]);
  });

  it("refuses the same file twice", async () => {
    const { email } = await existingUser("Importer");
    importFile(email, sampleFile());

    const run = importFile(email, sampleFile());

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("already has Cash USD, Bank EUR");
    expect(await signedInAs(email).then(newestFirst)).toHaveLength(4);
  });
});

function sampleFile() {
  return {
    accounts: [
      {
        name: "Cash USD",
        currency: "USD",
        color: "green",
        opening: { amount: 5000, date: "2025-01-01" },
      },
      { name: "Bank EUR", currency: "EUR", color: "blue" },
    ],
    categories: [
      { kind: "income", name: "Salary", icon: "briefcase", color: "green" },
      {
        kind: "expense",
        name: "Food",
        icon: "utensils",
        color: "orange",
        subcategories: [{ name: "Lunches", icon: "pizza", color: "orange" }],
      },
      { kind: "expense", name: "Transport", icon: "bus", color: "blue" },
    ],
    // Listed out of order: recordedAt alone decides the order within a day.
    transactions: [
      {
        type: "transfer",
        date: "2025-01-02",
        recordedAt: "2025-01-02T18:00:00-03:00",
        title: "To the bank",
        account: "Cash USD",
        amount: 1100,
        toAccount: "Bank EUR",
        toAmount: 1000,
      },
      {
        type: "expense",
        date: "2025-01-02",
        recordedAt: "2025-01-02T12:00:00-03:00",
        title: "Lunch",
        account: "Cash USD",
        amount: 1500,
        category: "Food",
        subcategory: "Lunches",
      },
      {
        type: "refund",
        date: "2025-01-02",
        recordedAt: "2025-01-02T15:00:00-03:00",
        title: "Bus refund",
        account: "Cash USD",
        amount: 250,
        category: "Transport",
      },
      {
        type: "income",
        date: "2025-01-01",
        title: "Pay",
        account: "Cash USD",
        amount: 5000,
        category: "Salary",
      },
    ],
  };
}

function importFile(email: string, contents: unknown, options: string[] = []) {
  const path = join(mkdtempSync(join(tmpdir(), "import-")), "import.json");
  writeFileSync(path, JSON.stringify(contents));
  return spawnSync(
    "node",
    ["cli/instance.ts", "import", email, path, "--env", ".env.instance.local", ...options],
    { encoding: "utf8" },
  );
}

type Client = Awaited<ReturnType<typeof signedInAs>>;

async function balances(client: Client) {
  const { data, error } = await client
    .from("accounts")
    .select("name, currency, balance")
    .order("position");
  if (error) throw error;
  return data;
}

async function newestFirst(client: Client) {
  const { data, error } = await client
    .from("transaction_details")
    .select("date, type, title")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// A built-in category, which has no name, goes by its built-in key.
async function categoryNames(client: Client) {
  const { data, error } = await client
    .from("categories")
    .select("id, kind, name, parent_id, built_in");
  if (error) throw error;
  const names = new Map(data.map((c) => [c.id, c.name]));
  return data.map((c) =>
    [c.kind, c.parent_id ? names.get(c.parent_id) : undefined, c.name ?? c.built_in]
      .filter(Boolean)
      .join("/"),
  );
}
