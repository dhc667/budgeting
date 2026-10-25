import { nameKey, sameName } from "../../src/names.ts";
import type { AppSupabase } from "../../src/supabase/client.ts";
import type { Database } from "../../src/supabase/database.ts";
import type { Enums } from "../../src/supabase/database.types.ts";
import { fail } from "../fail.ts";
import { dataOf } from "./command.ts";
import { signedIn } from "./session.ts";

export async function signedInDirectory(envPath: string) {
  const { supabase, userId } = await signedIn(envPath);
  return { supabase, userId, directory: await loadDirectory(supabase, userId) };
}

// Everything a flag can name, read once per command: a family's whole set is small.
export async function loadDirectory(supabase: AppSupabase, userId: string): Promise<Directory> {
  const [spaces, accounts, categories, counterparties, currencies] = await Promise.all([
    dataOf(supabase.from("spaces").select("id, name, private_owner").order("created_at")),
    dataOf(supabase.from("accounts").select(accountColumns).order("position")),
    dataOf(supabase.from("categories").select(categoryColumns).order("kind").order("name")),
    dataOf(
      supabase
        .from("ledger_accounts")
        .select("id, space_id, name, color")
        .eq("kind", "counterparty")
        .order("name"),
    ),
    dataOf(supabase.from("currencies").select("code, decimals")),
  ]);
  return new Directory(
    spaces.map((space) => ({
      id: space.id,
      name: space.name ?? "Private",
      private: space.private_owner === userId,
    })),
    accounts,
    categories,
    counterparties.flatMap(({ id, space_id, name, color }) =>
      name !== null && color !== null ? [{ id, space_id, name, color }] : [],
    ),
    new Map(currencies.map(({ code, decimals }) => [code, decimals])),
  );
}

export class Directory {
  readonly spaces: Space[];
  readonly accounts: Account[];
  readonly categories: Category[];
  readonly counterparties: Counterparty[];
  private readonly decimalsByCurrency: Map<string, number>;

  constructor(
    spaces: Space[],
    accounts: Account[],
    categories: Category[],
    counterparties: Counterparty[],
    decimalsByCurrency: Map<string, number>,
  ) {
    this.spaces = spaces;
    this.accounts = accounts;
    this.categories = categories;
    this.counterparties = counterparties;
    this.decimalsByCurrency = decimalsByCurrency;
  }

  // `private` is the user's private space, whatever it's called in their language.
  space(text: string, flag: string): Space {
    return pick(
      flag,
      this.spaces,
      text,
      (space) => [space.name, ...(space.private ? ["private"] : [])],
      {
        describe: (space) => `${space.name} (${this.shortId(space.id)})`,
      },
    );
  }

  privateSpace(): Space {
    const space = this.spaces.find((candidate) => candidate.private);
    if (!space) fail("You have no private space; pass --space.");
    return space;
  }

  spaceOrPrivate(text: string | undefined, flag = "--space"): Space {
    return text === undefined ? this.privateSpace() : this.space(text, flag);
  }

  // Across every space: a transfer can cross them.
  account(text: string, flag: string): Account {
    return pick(flag, this.accounts, text, (account) => [account.name], {
      describe: (account) => this.described(account.name, account),
    });
  }

  accountWithId(id: string): Account {
    const account = this.accounts.find((candidate) => candidate.id === id);
    if (!account) fail(`No account ${id} that you can see.`);
    return account;
  }

  // By its path, Food/Luxury; a bare name is a top-level one.
  category(
    text: string,
    flag: string,
    where: { spaceId?: string; kind?: CategoryKind } = {},
  ): Category {
    const candidates = this.categories.filter(
      ({ space_id, kind }) =>
        (where.spaceId === undefined || space_id === where.spaceId) &&
        (where.kind === undefined || kind === where.kind),
    );
    return pick(flag, candidates, text, (category) => [this.categoryPath(category.id)], {
      describe: (category) =>
        this.described(`${category.kind} ${this.categoryPath(category.id)}`, category),
      sameName: samePath,
    });
  }

  counterparty(text: string, flag: string, where: { spaceId?: string } = {}): Counterparty {
    const candidates = this.counterparties.filter(
      ({ space_id }) => where.spaceId === undefined || space_id === where.spaceId,
    );
    return pick(flag, candidates, text, (counterparty) => [counterparty.name], {
      describe: (counterparty) => this.described(counterparty.name, counterparty),
    });
  }

  spaceName(id: string | null): string | null {
    return this.spaces.find((space) => space.id === id)?.name ?? null;
  }

  accountName(id: string | null): string | null {
    return this.accounts.find((account) => account.id === id)?.name ?? null;
  }

  categoryPath(id: string | null): string | null {
    const category = this.categories.find((candidate) => candidate.id === id);
    if (!category) return null;
    const name = category.built_in ? builtInName(category.built_in) : (category.name ?? "");
    const parent = this.categories.find(({ id }) => id === category.parent_id);
    return parent?.name ? `${parent.name}/${name}` : name;
  }

  counterpartyName(id: string | null): string | null {
    return this.counterparties.find((counterparty) => counterparty.id === id)?.name ?? null;
  }

  decimals(currency: string): number {
    const decimals = this.decimalsByCurrency.get(currency);
    if (decimals === undefined) fail(`No currency ${currency}.`);
    return decimals;
  }

  shortId(id: string, others: string[] = []): string {
    return shortestUniquePrefix(id, [
      ...this.spaces.map((space) => space.id),
      ...this.accounts.map((account) => account.id),
      ...this.categories.map((category) => category.id),
      ...this.counterparties.map((counterparty) => counterparty.id),
      ...others,
    ]);
  }

  private described(label: string, thing: { id: string; space_id: string }): string {
    return `${label} in ${this.spaceName(thing.space_id) ?? "?"} (${this.shortId(thing.id)})`;
  }
}

// A short id is any prefix of an id that long or longer.
export const shortIdLength = 8;

function shortestUniquePrefix(id: string, ids: string[]): string {
  const others = ids.filter((other) => other !== id);
  for (let length = shortIdLength; length < id.length; length++) {
    const prefix = id.slice(0, length);
    if (!others.some((other) => other.startsWith(prefix))) return prefix;
  }
  return id;
}

export function isIdPrefix(text: string): boolean {
  return text.length >= shortIdLength && /^[0-9a-f-]+$/i.test(text);
}

// A name and an id prefix can both match, and two names can match once case and spacing are set
// aside: any of that is refused, naming the candidates, rather than guessed.
function pick<Thing extends { id: string }>(
  flag: string,
  candidates: Thing[],
  text: string,
  namesOf: (thing: Thing) => (string | null)[],
  options: { describe: (thing: Thing) => string; sameName?: (a: string, b: string) => boolean },
): Thing {
  const matchesName = options.sameName ?? sameName;
  const prefix = text.toLowerCase();
  const matches = candidates.filter(
    (thing) =>
      (isIdPrefix(text) && thing.id.startsWith(prefix)) ||
      namesOf(thing).some((name) => name !== null && matchesName(name, text)),
  );
  const [only, ...others] = matches;
  if (only && others.length === 0) return only;
  if (!only) fail(`${flag}: nothing is called ${text}, and no id starts with it.`);
  fail(
    `${flag}: ${text} could be any of these; give its id:\n${matches.map((thing) => `  ${options.describe(thing)}`).join("\n")}`,
  );
}

function samePath(path: string, text: string): boolean {
  const segments = (value: string) => value.split("/").map(nameKey);
  return JSON.stringify(segments(path)) === JSON.stringify(segments(text));
}

// They have no stored name: the app names them in its reader's language, the CLI in English.
function builtInName(builtIn: Enums<"built_in_category">): string {
  switch (builtIn) {
    case "debts_forgiven":
      return "Debts forgiven";
    case "debts_forgiven_to_you":
      return "Debts forgiven to you";
  }
}

const accountColumns =
  "id, space_id, name, currency, color, balance, opening_balance, opening_date, archived, has_transactions";

const categoryColumns =
  "id, space_id, kind, name, built_in, icon, color, parent_id, transaction_count";

export type Space = { id: string; name: string; private: boolean };

export type Account = Pick<
  Database["public"]["Views"]["accounts"]["Row"],
  | "id"
  | "space_id"
  | "name"
  | "currency"
  | "color"
  | "balance"
  | "opening_balance"
  | "opening_date"
  | "archived"
  | "has_transactions"
>;

export type Category = Pick<
  Database["public"]["Views"]["categories"]["Row"],
  | "id"
  | "space_id"
  | "kind"
  | "name"
  | "built_in"
  | "icon"
  | "color"
  | "parent_id"
  | "transaction_count"
>;

export type CategoryKind = Category["kind"];

export type Counterparty = { id: string; space_id: string; name: string; color: Enums<"color"> };
