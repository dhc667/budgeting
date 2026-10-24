import type { PostgrestError } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addAccount } from "../support/accounts.ts";
import { daysAgo } from "../support/dates.ts";
import {
  createSpace,
  instance,
  privateSpaceOf,
  signedInUser,
  sql,
  type SignedInUser as User,
} from "../support/local-instance.ts";

// Ben shares a space with Ana, but not her private space: if anyone could reach into it, he
// could. Everything the app can read or call is tried, so that what's added later is too.

let ana: User;
let ben: User;
let mine: Mine;
let sharedAccount: string;

beforeAll(async () => {
  [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
  const shared = await createSpace(ana, "Ana & Ben", [ben]);
  sharedAccount = await addAccount(ana, shared, "Joint");
  mine = await fillPrivateSpace(ana);
});

afterAll(() => sql.end());

describe("someone outside a space", () => {
  it("reads nothing of it from any table or view, while still reading what's shared", async () => {
    const relations = await relationsUsersRead();

    const leaks = await Promise.all(
      relations.map(async (relation) => ({ relation, leaked: leaked(await read(ben, relation)) })),
    );

    expect(leaks.filter(({ leaked }) => leaked.length > 0)).toEqual([]);
    expect(await read(ben, "accounts")).toContain(sharedAccount);
  });

  it("reads nothing of it through any function", async () => {
    const results = await Promise.all(
      Object.entries(reads).map(async ([name, call]) => ({
        name,
        leaked: leaked(JSON.stringify(await call(ben, mine))),
      })),
    );

    expect(results.filter(({ leaked }) => leaked.length > 0)).toEqual([]);
  });

  it("changes nothing in it, whichever way it's written", async () => {
    const before = await whatAnaSees();

    for (const write of [...Object.values(writes), ...tableWrites]) await write(ben, mine);

    expect(await whatAnaSees()).toEqual(before);
  });

  it("is checked for every function users can call", async () => {
    const tried = [...Object.keys(reads), ...Object.keys(writes), ...instanceWide];

    expect(tried.toSorted()).toEqual(await functionsUsersCall());
  });
});

// Every id of Ana's private space, and what she typed in it.
type Mine = {
  space: string;
  account: string;
  category: string;
  counterparty: string;
  transaction: string;
  debt: string;
  budget: string;
  recurring: string;
  title: string;
};

async function fillPrivateSpace(user: User): Promise<Mine> {
  const { id: space } = await privateSpaceOf(user);
  const account = await addAccount(user, space, "Savings");
  const category = await user.client.rpc("create_category", {
    space,
    category_name: "Hobbies",
    category_kind: "expense",
    category_icon: "palette",
    category_color: "violet",
    parent: null,
  });
  if (category.error) throw category.error;
  const counterparty = crypto.randomUUID();
  await succeeded(
    user.client.rpc("create_counterparty", {
      space,
      counterparty_name: "Carla",
      counterparty_color: "pink",
      counterparty_id: counterparty,
    }),
  );
  const title = `Ana's secret ${crypto.randomUUID()}`;
  const transaction = crypto.randomUUID();
  await succeeded(
    user.client.rpc(
      "add_transaction",
      expenseArgs({ transaction, account, category: category.data, title }),
    ),
  );
  const debt = crypto.randomUUID();
  await succeeded(
    user.client.rpc("add_transaction", {
      ...expenseArgs({ transaction: debt, account, category: null, title }),
      transaction_type: "given",
      counterparty,
    }),
  );
  const budget = await user.client
    .from("budgets")
    .insert({
      space_id: space,
      name: "Fun",
      currency: "USD",
      amount: 10_000,
      starts_on: daysAgo(30),
      every: 1,
      unit: "month",
      category_ids: [category.data],
    })
    .select("id")
    .single();
  if (budget.error) throw budget.error;
  const recurring = await user.client.rpc(
    "create_recurring_transaction",
    ruleArgs(account, category.data, title),
  );
  if (recurring.error) throw recurring.error;
  return {
    space,
    account,
    category: category.data,
    counterparty,
    transaction,
    debt,
    budget: budget.data.id,
    recurring: recurring.data,
    title,
  };
}

async function succeeded(call: PromiseLike<{ error: PostgrestError | null }>) {
  const { error } = await call;
  if (error) throw error;
}

// What a response gives away of Ana's private space.
function leaked(response: string): string[] {
  return secrets(mine).filter((secret) => response.includes(secret));
}

function secrets({ title, ...ids }: Mine): string[] {
  return [title, ...Object.values(ids)];
}

// Everything Ana sees that has to do with her private space, or her profile.
async function whatAnaSees(): Promise<Record<string, string[]>> {
  const watched = [...secrets(mine), ana.userId];
  const seen = await Promise.all(
    (await relationsUsersRead()).map(async (relation) => {
      const parsed: unknown = JSON.parse(await read(ana, relation));
      const rows = Array.isArray(parsed) ? parsed.map((row: unknown) => JSON.stringify(row)) : [];
      const ours = rows.filter((row) => watched.some((id) => row.includes(id)));
      return [relation, ours] as const;
    }),
  );
  return Object.fromEntries(seen);
}

async function relationsUsersRead(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
      and has_table_privilege('authenticated', c.oid, 'select')
    order by 1`;
  return rows.map(({ name }) => name);
}

async function functionsUsersCall(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select distinct p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1`;
  return rows.map(({ name }) => name);
}

// Through the Data API, as the app reads: every row the user may see.
async function read(user: User, relation: string): Promise<string> {
  const { data } = await user.client.auth.getSession();
  const response = await fetch(`${instance.supabaseUrl}/rest/v1/${relation}?select=*`, {
    headers: {
      apikey: instance.publishableKey,
      Authorization: `Bearer ${data.session?.access_token}`,
    },
  });
  if (!response.ok) throw new Error(`Reading ${relation} failed: ${await response.text()}`);
  return response.text();
}

type Call = (user: User, mine: Mine) => PromiseLike<unknown>;

const reads: Record<string, Call> = {
  account_history: (user, { account }) =>
    user.client.rpc("account_history", { account_id: account }),
  budget_history: (user, { budget }) => user.client.rpc("budget_history", { budget_id: budget }),
  budget_spending: (user, { budget }) => user.client.rpc("budget_spending", { budget_id: budget }),
  can_change_transaction: (user, { transaction }) =>
    user.client.rpc("can_change_transaction", { transaction }),
  changes_since: (user) => user.client.rpc("changes_since", { since: 0, held_currencies: ["USD"] }),
  is_opening_balance: (user, { transaction }) =>
    user.client.rpc("is_opening_balance", { transaction }),
  is_space_member: (user, { space }) => user.client.rpc("is_space_member", { space }),
  my_space_ids: (user) => user.client.rpc("my_space_ids"),
  opening_balance_transaction: (user, { account }) =>
    user.client.rpc("opening_balance_transaction", { account }),
  recurring_transaction_history: (user, { recurring }) =>
    user.client.rpc("recurring_transaction_history", { recurring_transaction_id: recurring }),
  title_suggestions: (user) => user.client.rpc("title_suggestions"),
  transaction_history: (user, { transaction }) =>
    user.client.rpc("transaction_history", { transaction_id: transaction }),
  transaction_type: (user, { transaction }) => user.client.rpc("transaction_type", { transaction }),
};

// Most are refused, but some just leave alone what row security keeps from the user.
type Write = (user: User, mine: Mine) => PromiseLike<unknown>;

const writes: Record<string, Write> = {
  add_transaction: (user, { account, category }) =>
    user.client.rpc(
      "add_transaction",
      expenseArgs({ transaction: crypto.randomUUID(), account, category, title: "Ben's" }),
    ),
  create_account: (user, { space }) =>
    user.client.rpc("create_account", {
      space,
      account_name: "Ben's",
      account_currency: "USD",
      account_color: "blue",
      opening_amount: 0,
      opening_date: daysAgo(1),
    }),
  create_category: (user, { space }) =>
    user.client.rpc("create_category", {
      space,
      category_name: "Ben's",
      category_kind: "expense",
      category_icon: "palette",
      category_color: "blue",
      parent: null,
    }),
  create_counterparty: (user, { space }) =>
    user.client.rpc("create_counterparty", {
      space,
      counterparty_name: "Ben's",
      counterparty_color: "blue",
      counterparty_id: crypto.randomUUID(),
    }),
  create_recurring_transaction: (user, { account, category }) =>
    user.client.rpc("create_recurring_transaction", ruleArgs(account, category, "Ben's")),
  delete_category: (user, { category }) =>
    user.client.rpc("delete_category", { category_id: category, move_to: null }),
  delete_counterparty: (user, { counterparty }) =>
    user.client.rpc("delete_counterparty", { counterparty_id: counterparty }),
  delete_recurring_transaction: (user, { recurring }) =>
    user.client.rpc("delete_recurring_transaction", { recurring_transaction_id: recurring }),
  delete_transaction: (user, { transaction }) =>
    user.client.rpc("delete_transaction", { transaction_id: transaction }),
  pause_recurring_transaction: (user, { recurring }) =>
    user.client.rpc("pause_recurring_transaction", { recurring_transaction_id: recurring }),
  record_recurring_transaction: (user, { recurring }) =>
    user.client.rpc("record_recurring_transaction", {
      recurring_transaction_id: recurring,
      occurrence: 0,
      transaction_date: daysAgo(1),
      amount: 1,
      to_amount: null,
    }),
  reorder_accounts: (user, { account }) =>
    user.client.rpc("reorder_accounts", { account_ids: [account] }),
  restore_transaction: (user, { transaction }) =>
    user.client.rpc("restore_transaction", { transaction_id: transaction }),
  resume_recurring_transaction: (user, { recurring }) =>
    user.client.rpc("resume_recurring_transaction", {
      recurring_transaction_id: recurring,
      seen_done: 0,
      next_occurrence: 1,
    }),
  set_budget_exclusions: (user, { transaction, budget }) =>
    user.client.rpc("set_budget_exclusions", { transaction_id: transaction, budget_ids: [budget] }),
  skip_recurring_transaction: (user, { recurring }) =>
    user.client.rpc("skip_recurring_transaction", {
      recurring_transaction_id: recurring,
      occurrence: 0,
    }),
  update_account: (user, { account }) =>
    user.client.rpc("update_account", {
      account_id: account,
      account_name: "Ben's",
      account_currency: "USD",
      account_color: "red",
      opening_amount: 1,
      opening_date: daysAgo(1),
    }),
  update_category: (user, { category }) =>
    user.client.rpc("update_category", {
      category_id: category,
      category_name: "Ben's",
      category_kind: "expense",
      category_icon: "palette",
      category_color: "red",
      parent: null,
    }),
  update_counterparty: (user, { counterparty }) =>
    user.client.rpc("update_counterparty", {
      counterparty_id: counterparty,
      counterparty_name: "Ben's",
      counterparty_color: "red",
    }),
  update_recurring_transaction: (user, { recurring, account, category }) =>
    user.client.rpc("update_recurring_transaction", {
      ...ruleArgs(account, category, "Ben's"),
      recurring_transaction_id: recurring,
      seen_done: 0,
      restart: false,
    }),
  update_transaction: (user, { transaction, account, category }) =>
    user.client.rpc("update_transaction", {
      ...expenseArgs({ transaction: "", account, category, title: "Ben's" }),
      transaction_id: transaction,
    }),
};

const tableWrites: Write[] = [
  (user, { account }) => user.client.from("accounts").update({ archived: true }).eq("id", account),
  (user, { account }) => user.client.from("accounts").delete().eq("id", account),
  (user, { account }) =>
    user.client.from("ledger_accounts").update({ archived: true, position: 0 }).eq("id", account),
  (user, { account }) => user.client.from("ledger_accounts").delete().eq("id", account),
  (user, { space, category }) =>
    user.client.from("budgets").insert({
      space_id: space,
      name: "Ben's",
      currency: "USD",
      amount: 1,
      starts_on: daysAgo(1),
      every: 1,
      unit: "month",
      category_ids: [category],
    }),
  (user, { budget }) => user.client.from("budgets").update({ amount: 1 }).eq("id", budget),
  (user, { budget }) => user.client.from("budgets").delete().eq("id", budget),
  (user, { space }) => user.client.from("spaces").update({ name: "Ben's" }).eq("id", space),
  (user, { space }) => user.client.from("spaces").delete().eq("id", space),
  (user, { space }) =>
    user.client.from("space_members").insert({ space_id: space, user_id: user.userId }),
  (user, { space }) => user.client.from("space_members").delete().eq("space_id", space),
  (user) => user.client.from("profiles").update({ display_name: "Ben's" }).eq("id", ana.userId),
];

// The same for every user: exchange rates, and what the instance itself reports.
const instanceWide = [
  "create_space",
  "latest_exchange_rates",
  "merged_snapshot",
  "record_exchange_rate_history_starts",
  "save_exchange_rates",
  "schema_version",
  "stored_exchange_rate_ranges",
];

type ExpenseIds = {
  transaction: string;
  account: string;
  category: string | null;
  title: string;
};

function expenseArgs({ transaction, account, category, title }: ExpenseIds) {
  return {
    transaction_id: transaction,
    transaction_type: "expense" as const,
    transaction_date: daysAgo(1),
    title,
    note: title,
    account,
    amount: 1_000,
    category,
    to_account: null,
    to_amount: null,
    counterparty: null,
  };
}

function ruleArgs(account: string, category: string, title: string) {
  return {
    transaction_type: "expense" as const,
    title,
    note: null,
    account,
    amount: 5_000,
    category,
    to_account: null,
    to_amount: null,
    starts_on: daysAgo(1),
    every: 1,
    unit: "month" as const,
    ends_on: null,
    times: null,
    record_first: false,
  };
}
