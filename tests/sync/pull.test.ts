import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Changes, type LocalCopy, type SyncedTable } from "../../src/sync/copy";
import { changesFrom, copyName } from "../../src/sync/copy-source";
import { signOutAndDeleteCopy } from "../../src/sync/sign-out";
import { deleteCopy, openCopyStore } from "../../src/sync/store";
import { createCopySync } from "../../src/sync/sync";
import { signOutHere } from "../../src/supabase/client";
import {
  createSpace,
  instance,
  privateSpaceOf,
  signedInUser,
  sql,
  type SignedInUser as User,
} from "../support/local-instance";
import { addAccount } from "../support/accounts";
import { daysAgo, today } from "../support/dates";
import { addRates, rateDates } from "../support/rates";

afterAll(() => sql.end());

let ana: User;
let ben: User;
let familyId: string;

beforeEach(async () => {
  [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
  familyId = await createSpace(ana, "Family", [ben]);
});

describe("pulling the local copy", () => {
  it("gets everything the user can see on the first pull", async () => {
    await addAccount(ana, familyId, "Checking");
    const device = deviceOf(ben);

    await device.sync.pull();

    expect(namesIn(device.copy(), "spaces")).toContain("Family");
    expect(namesIn(device.copy(), "ledger_accounts")).toContain("Checking");
    expect(idsIn(device.copy(), "spaces")).toContain((await privateSpaceOf(ben)).id);
    expect(idsIn(device.copy(), "spaces")).not.toContain((await privateSpaceOf(ana)).id);
    expect(device.copy().schemaVersion).toBe(schemaVersion);
  });

  it("brings another member's change at the next pull, not before", async () => {
    const device = deviceOf(ben);
    await device.sync.pull();

    await addAccount(ana, familyId, "Savings");
    expect(namesIn(device.copy(), "ledger_accounts")).not.toContain("Savings");
    await device.sync.pull();

    expect(namesIn(device.copy(), "ledger_accounts")).toContain("Savings");
  });

  it("removes a row deleted since the last pull", async () => {
    const id = await addExpense(ana, 2_500);
    const device = deviceOf(ben);
    await device.sync.pull();
    expect(idsIn(device.copy(), "transactions")).toContain(id);

    await ana.client.rpc("delete_transaction", { transaction_id: id });
    await device.sync.pull();

    expect(idsIn(device.copy(), "transactions")).not.toContain(id);
    expect(postingsOf(device.copy(), id)).toEqual([]);
  });

  it("brings a space's accounts when the user joins it, and drops them when they leave", async () => {
    const carla = await signedInUser("Carla");
    await addAccount(ana, familyId, "Joint");
    const device = deviceOf(carla);
    await device.sync.pull();
    expect(namesIn(device.copy(), "spaces")).not.toContain("Family");

    await ana.client.from("space_members").insert({ space_id: familyId, user_id: carla.userId });
    await device.sync.pull();
    expect(namesIn(device.copy(), "spaces")).toContain("Family");
    expect(namesIn(device.copy(), "ledger_accounts")).toContain("Joint");

    await carla.client
      .from("space_members")
      .delete()
      .match({ space_id: familyId, user_id: carla.userId });
    await device.sync.pull();
    expect(namesIn(device.copy(), "spaces")).not.toContain("Family");
    expect(namesIn(device.copy(), "ledger_accounts")).not.toContain("Joint");
  });

  it("drops a transaction the user lost sight of when a posting moved away", async () => {
    const id = await addExpense(ana, 2_500);
    const device = deviceOf(ben);
    await device.sync.pull();

    await ana.client
      .from("space_members")
      .delete()
      .match({ space_id: familyId, user_id: ben.userId });
    await device.sync.pull();

    expect(idsIn(device.copy(), "transactions")).not.toContain(id);
  });

  it("opens a saved copy before any pull, and a later pull brings only what changed", async () => {
    const first = deviceOf(ben);
    await first.sync.pull();
    first.sync.close();
    await addAccount(ana, familyId, "Savings");

    const reopened = deviceOf(ben);
    reopened.failing = true;
    await reopened.sync.pull();
    expect(namesIn(reopened.copy(), "spaces")).toContain("Family");
    expect(namesIn(reopened.copy(), "ledger_accounts")).not.toContain("Savings");
    reopened.failing = false;
    reopened.fetchedSince.length = 0;
    await reopened.sync.pull();

    expect(namesIn(reopened.copy(), "ledger_accounts")).toContain("Savings");
    const since = first.copy().version;
    expect(reopened.fetchedSince).toEqual([since]);
  });

  it("starts empty for another user on the same device", async () => {
    const first = deviceOf(ben);
    await first.sync.pull();
    first.sync.close();

    const other = deviceOf(ana);
    other.failing = true;
    await other.sync.pull();

    expect(other.published).toEqual([]);
  });

  it("starts over when the saved copy was built by another version of the app", async () => {
    const old = deviceOf(ben, schemaVersion - 1);
    await old.sync.pull();
    old.sync.close();

    const current = deviceOf(ben);
    current.failing = true;
    await current.sync.pull();
    expect(current.published).toEqual([]);
    current.failing = false;
    current.fetchedSince.length = 0;
    await current.sync.pull();
    expect(current.fetchedSince).toEqual([0]);
  });

  it("pulls everything again when its version is ahead of the instance's", async () => {
    const device = deviceOf(ben);
    await device.sync.pull();
    device.sync.close();
    const ahead = withStaleCurrency({
      ...device.copy(),
      version: device.copy().version + 1_000_000,
    });
    await saveDirectly(ben, ahead);

    const restored = deviceOf(ben);
    await restored.sync.pull();

    expect(restored.fetchedSince).toEqual([ahead.version]);
    expect(restored.copy().version).toBeLessThan(ahead.version);
    expect(idsIn(restored.copy(), "currencies")).not.toContain("ZZZ");
    expect(namesIn(restored.copy(), "spaces")).toContain("Family");
  });

  it("pulls everything again when the user's spaces changed while it was closed", async () => {
    const device = deviceOf(ben);
    await device.sync.pull();
    device.sync.close();
    await saveDirectly(ben, withStaleCurrency({ ...device.copy(), spaceIds: [] }));

    const reopened = deviceOf(ben);
    await reopened.sync.pull();

    expect(reopened.fetchedSince).toEqual([device.copy().version, 0]);
    expect(reopened.copy().spaceIds).toContain(familyId);
    expect(idsIn(reopened.copy(), "currencies")).not.toContain("ZZZ");
  });

  it("brings the history of a currency that comes into use without pulling everything again", async () => {
    await addRates("XPA");
    const device = deviceOf(ben);
    await device.sync.pull();
    expect(rateDatesIn(device.copy(), "XPA")).toHaveLength(1);
    const { version } = device.copy();

    await addAccount(ana, familyId, "Euros", { currency: "XPA" });
    await device.sync.pull();

    expect(device.fetchedSince).toEqual([0, version]);
    expect(rateDatesIn(device.copy(), "XPA")).toEqual(rateDates());
    expect(device.copy().rateCurrencies).toContain("XPA");
  });

  it("keeps only the latest rate of a currency that falls out of use", async () => {
    await addRates("XPA");
    const device = deviceOf(ben);
    await saveDisplayCurrency(ben, "XPA");
    await device.sync.pull();
    expect(rateDatesIn(device.copy(), "XPA")).toEqual(rateDates());

    await saveDisplayCurrency(ben, "USD");
    await device.sync.pull();

    expect(rateDatesIn(device.copy(), "XPA")).toEqual([daysAgo(1)]);
    expect(device.copy().rateCurrencies).not.toContain("XPA");
  });

  it("drops the superseded latest rate of a currency the user doesn't use", async () => {
    await addRates("XPB");
    const device = deviceOf(ben);
    await device.sync.pull();
    expect(rateDatesIn(device.copy(), "XPB")).toEqual([daysAgo(1)]);

    await sql`insert into public.exchange_rates (date, currency, rate) values (${today()}, 'XPB', 1.6) on conflict do nothing`;
    await device.sync.pull();

    expect(rateDatesIn(device.copy(), "XPB")).toEqual([today()]);
  });

  it("keeps showing the old copy while a pull starting over is under way", async () => {
    const device = deviceOf(ben);
    await device.sync.pull();
    const before = device.copy();
    expect(namesIn(before, "spaces")).toContain("Family");
    await ana.client
      .from("space_members")
      .delete()
      .match({ space_id: familyId, user_id: ben.userId });
    const release = device.holdFromScratch();

    const pulling = device.sync.pull();
    await vi.waitFor(() => expect(device.fetchedSince).toEqual([0, before.version, 0]));

    expect(device.copy()).toBe(before);
    expect(device.published).not.toContain(null);
    release.resolve();
    await pulling;
    expect(namesIn(device.copy(), "spaces")).not.toContain("Family");
    expect(device.published).not.toContain(null);
  });

  it("keeps the copy when a pull fails", async () => {
    const device = deviceOf(ben);
    await device.sync.pull();
    const before = device.copy();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    device.failing = true;

    await device.sync.pull();

    expect(device.copy()).toBe(before);
    device.failing = false;
    await addAccount(ana, familyId, "Savings");
    await device.sync.pull();
    expect(namesIn(device.copy(), "ledger_accounts")).toContain("Savings");
  });

  // Pins the module's contract that pulls never overlap, through the injected fetchChanges.
  it("runs one pull at a time, and one more after it however often it is asked", async () => {
    const device = deviceOf(ben);
    await device.sync.pull();
    device.fetchedSince.length = 0;

    await Promise.all([
      device.sync.pull(),
      device.sync.pull(),
      device.sync.pull(),
      device.sync.pull(),
    ]);

    expect(device.fetchedSince).toHaveLength(2);
    expect(device.maxConcurrent).toBe(1);
  });

  it("publishes only when the copy changed", async () => {
    const device = deviceOf(ben);
    await device.sync.pull();
    const published = device.published.length;

    await device.sync.pull();
    expect(device.published).toHaveLength(published);

    await addAccount(ana, familyId, "Savings");
    await device.sync.pull();
    expect(device.published).toHaveLength(published + 1);
  });

  it("deletes the user's copy on signing out", async () => {
    const first = deviceOf(ben);
    await first.sync.pull();
    first.sync.close();

    await signOutAndDeleteCopy(ben.client, instance);

    const after = deviceOf(ben);
    after.failing = true;
    await after.sync.pull();
    expect(after.published).toEqual([]);
  });

  it("deletes the copy of a user whose session already expired", async () => {
    const first = deviceOf(ben);
    await first.sync.pull();
    first.sync.close();
    await signOutHere(ben.client);

    await signOutAndDeleteCopy(ben.client, instance, ben.userId);

    const after = deviceOf(ben);
    after.failing = true;
    await after.sync.pull();
    expect(after.published).toEqual([]);
  });

  it("downloads nothing when closed before its saved copy has opened", async () => {
    const device = deviceOf(ben);
    const pulling = device.sync.pull();
    device.sync.close();
    await pulling;

    expect(device.fetchedSince).toEqual([]);
  });

  it("does not bring the copy back once closed, even with a pull waiting", async () => {
    const entered = deferred();
    const release = deferred();
    const real = changesFrom(ben.client);
    const name = copyName(instance, ben.userId);
    const sync = createCopySync({
      name,
      schemaVersion,
      publish: () => undefined,
      async fetchChanges(since, held) {
        entered.resolve();
        await release.promise;
        return real(since, held);
      },
    });
    const pulls = [sync.pull(), sync.pull()];
    await entered.promise;

    sync.close();
    await deleteCopy(name);
    release.resolve();
    await Promise.all(pulls);

    const databases = await indexedDB.databases();
    expect(databases.map((database) => database.name)).not.toContain(name);
  });
});

const schemaVersion = 3;

function deviceOf(user: User, version = schemaVersion) {
  const real = changesFrom(user.client);
  let running = 0;
  const published: (LocalCopy | null)[] = [];
  const fetchedSince: number[] = [];
  let holding: ReturnType<typeof deferred> | null = null;
  const device = {
    published,
    fetchedSince,
    failing: false,
    holdFromScratch() {
      holding = deferred();
      return holding;
    },
    maxConcurrent: 0,
    copy() {
      const latest = device.published.at(-1);
      if (!latest) throw new Error("nothing published yet");
      return latest;
    },
    sync: createCopySync({
      name: copyName(instance, user.userId),
      schemaVersion: version,
      publish: (copy) => device.published.push(copy),
      async fetchChanges(since, held): Promise<Changes> {
        device.fetchedSince.push(since);
        if (since === 0) await holding?.promise;
        running += 1;
        device.maxConcurrent = Math.max(device.maxConcurrent, running);
        try {
          if (device.failing) throw new Error("offline");
          return await real(since, held);
        } finally {
          running -= 1;
        }
      },
    }),
  };
  return device;
}

function withStaleCurrency(copy: LocalCopy): LocalCopy {
  const stale = { code: "ZZZ", decimals: 2, rates_by_hand: false, version: 1 };
  const currencies = new Map(copy.rows.currencies).set(JSON.stringify(["ZZZ"]), stale);
  return { ...copy, rows: { ...copy.rows, currencies } };
}

// Arranges a copy a device saved earlier, which a pull alone can't produce.
async function saveDirectly(user: User, copy: LocalCopy) {
  const store = await openCopyStore(copyName(instance, user.userId));
  await store.save(copy, { startedOver: true, removed: [], written: copy.rows });
  store.close();
}

function namesIn(copy: LocalCopy, table: SyncedTable): unknown[] {
  return columnIn(copy, table, "name");
}

function idsIn(copy: LocalCopy, table: SyncedTable): unknown[] {
  return columnIn(copy, table, table === "currencies" ? "code" : "id");
}

function columnIn(copy: LocalCopy, table: SyncedTable, column: string): unknown[] {
  return [...copy.rows[table].values()].map((row): unknown => Reflect.get(row, column));
}

function postingsOf(copy: LocalCopy, transactionId: string) {
  return [...copy.rows.postings.values()].filter(
    (posting) => Reflect.get(posting, "transaction_id") === transactionId,
  );
}

function rateDatesIn(copy: LocalCopy, currency: string): string[] {
  return [...copy.rows.exchange_rates.values()]
    .filter((rate) => rate.currency === currency)
    .map(({ date }) => date)
    .sort();
}

async function saveDisplayCurrency(user: User, currency: string) {
  const { error } = await user.client
    .from("profiles")
    .update({ display_currency: currency })
    .eq("id", user.userId);
  if (error) throw error;
}

async function addExpense(user: User, amount: number): Promise<string> {
  const account = await addAccount(user, familyId, "Checking");
  const { data: category, error: categoryError } = await user.client
    .from("categories")
    .select("id")
    .eq("space_id", familyId)
    .eq("name", "Groceries")
    .single();
  if (categoryError) throw categoryError;
  const id = crypto.randomUUID();
  const { error } = await user.client.rpc("add_transaction", {
    transaction_id: id,
    transaction_type: "expense",
    transaction_date: today(),
    title: null,
    note: null,
    account,
    amount,
    category: category.id,
    to_account: null,
    to_amount: null,
  });
  if (error) throw error;
  return id;
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
