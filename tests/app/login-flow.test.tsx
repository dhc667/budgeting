// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildConnectLink } from "../../src/instance/connect-link";
import {
  admin,
  anonClient,
  defined,
  existingUser,
  inviteLink,
  password,
  signInLink,
  sql,
  uniqueEmail,
} from "../support/local-instance";
import { openApp, openSignedIn, signIn, user } from "../support/app";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(() => sql.end());

describe("joining with an invite", () => {
  it("creates the account and opens the dashboard", async () => {
    openApp(await inviteLink());

    await signUpAs("Ana");

    expect(await screen.findByRole("heading", { name: /, Ana$/ })).toBeTruthy();
  });

  it("explains that an invite can only be used once", async () => {
    const link = await inviteLink();
    openApp(link);
    await signUpAs("Ana");
    await screen.findByRole("heading", { name: /, Ana$/ });
    cleanup();
    localStorage.clear();

    openApp(link);
    await signUpAs("Ben");

    expect((await screen.findByRole("alert")).textContent).toMatch(/already used/);
  });
});

describe("signing in", () => {
  it("opens the dashboard with the right password", async () => {
    const { email } = await existingUser("Carla");
    openApp(signInLink());

    await signIn(email, password);

    expect(await screen.findByRole("heading", { name: /, Carla$/ })).toBeTruthy();
  });

  it("says so when the password is wrong", async () => {
    const { email } = await existingUser("Carla");
    openApp(signInLink());

    await signIn(email, "not my password");

    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid/i);
  });

  it("stays signed in when the app is reopened", async () => {
    const { email } = await existingUser("Carla");
    openApp(signInLink());
    await signIn(email, password);
    await screen.findByRole("heading", { name: /, Carla$/ });
    cleanup();

    openApp("http://localhost:3000/#/");

    expect(await screen.findByRole("heading", { name: /, Carla$/ })).toBeTruthy();
  });

  it("asks a device that was never connected to scan an invite", async () => {
    openApp("http://localhost:3000/#/");

    expect(await screen.findByText(/scan the invite QR code/)).toBeTruthy();
  });
});

describe("profile", () => {
  beforeEach(async () => {
    const { email } = await existingUser("Dani");
    openApp(signInLink());
    await signIn(email, password);
    await screen.findByRole("heading", { name: /, Dani$/ });
    await user.click(defined(screen.getAllByRole("link", { name: "Profile" })[0]));
  });

  it("renames the user and changes the currency totals are shown in", async () => {
    const card = within(await screen.findByRole("region", { name: "About you" }));
    const name = card.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Daniela");
    await user.selectOptions(card.getByLabelText("Display currency"), "EUR");
    await user.click(card.getByRole("button", { name: "Save" }));
    await card.findByText("Saved.");

    await user.click(defined(screen.getAllByRole("link", { name: "Home" })[0]));

    expect(await screen.findByRole("heading", { name: /, Daniela$/ })).toBeTruthy();
    expect(screen.getByText("€0.00")).toBeTruthy();
  });

  it("changes the password", async () => {
    await user.type(await screen.findByLabelText("New password"), "a brand new password");
    await user.type(screen.getByLabelText("Repeat new password"), "a brand new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Password changed.")).toBeTruthy();
  });

  it("refuses a password confirmation that doesn't match", async () => {
    await user.type(await screen.findByLabelText("New password"), "a brand new password");
    await user.type(screen.getByLabelText("Repeat new password"), "a different password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/don't match/);
  });

  it("signs out to the sign-in screen", async () => {
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
});

describe("language and formats", () => {
  it("shows the app in the chosen language", async () => {
    await openSignedIn("Dani");
    await openProfile();

    await chooseFormats({ language: "Español" });
    await user.click(defined(screen.getAllByRole("link", { name: "Inicio" })[0]));

    expect(await screen.findByRole("heading", { name: /^Buen[oa]s .+, Dani$/ })).toBeTruthy();
  });

  it("shows amounts in the chosen number format, whatever the language", async () => {
    await openSignedIn("Dani");
    await openProfile();

    await chooseFormats({ numbers: "1.234,56" });
    await user.click(defined(screen.getAllByRole("link", { name: "Home" })[0]));

    expect(await screen.findByText(/^\$\s0,00$/)).toBeTruthy();
  });

  it("follows the user to another device", async () => {
    const { email } = await openSignedIn("Dani");
    await openProfile();
    await chooseFormats({ language: "Português (Brasil)" });
    cleanup();
    localStorage.clear();

    openApp(signInLink());
    await signIn(email, password);

    expect(
      await screen.findByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite), Dani$/ }),
    ).toBeTruthy();
  });

  it("goes back to the device's language for the next person after signing out", async () => {
    await openSignedIn("Dani");
    await openProfile();
    await chooseFormats({ language: "Español" });

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
});

describe("signing out", () => {
  it("keeps the user signed in on their other devices", async () => {
    const { email } = await openSignedIn("Elena");
    const otherDevice = anonClient();
    await otherDevice.auth.signInWithPassword({ email, password });
    await user.click(defined(screen.getAllByRole("link", { name: "Profile" })[0]));

    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await screen.findByRole("heading", { name: "Sign in" });

    const { error } = await otherDevice.auth.refreshSession();
    expect(error).toBeNull();
  });

  it("leaves nothing behind for the next person who signs in on the device", async () => {
    await openSignedIn("Kim");
    await user.click(defined(screen.getAllByRole("link", { name: "Profile" })[0]));
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    const { email } = await existingUser("Lola");

    await signIn(email, password);

    expect(await screen.findByRole("heading", { name: /, Lola$/ })).toBeTruthy();
  });
  it("happens on its own once the user has been deleted", async () => {
    const { userId } = await openSignedIn("Nora");
    await admin.auth.admin.deleteUser(userId);
    cleanup();

    openApp("http://localhost:3000/#/");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
});

describe("an invite opened on a device that is already signed in", () => {
  it("offers to sign out, then creates the new account", async () => {
    await openSignedIn("Fede");
    cleanup();

    openApp(await inviteLink());
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await signUpAs("Gabi");

    expect(await screen.findByRole("heading", { name: /, Gabi$/ })).toBeTruthy();
  });
});

describe("a connect link to a different budget", () => {
  const otherBudget = buildConnectLink("http://localhost:3000/", {
    instance: { supabaseUrl: "https://127.0.0.1:1", publishableKey: "sb_publishable_other" },
    inviteCode: null,
  });

  it("asks first, and staying leaves the device as it was", async () => {
    await openSignedIn("Hugo");
    cleanup();

    openApp(otherBudget);
    await screen.findByRole("heading", { name: "Switch to a different budget?" });
    await user.click(screen.getByRole("button", { name: /^Stay connected/ }));

    expect(await screen.findByRole("heading", { name: /, Hugo$/ })).toBeTruthy();
  });

  it("signs out of the current budget when switching", async () => {
    await openSignedIn("Inés");
    cleanup();
    openApp(otherBudget);
    await user.click(await screen.findByRole("button", { name: "Switch" }));
    // The app retries once before giving up on an unreachable instance.
    await screen.findByRole("heading", { name: "Can't reach your budget" });
    cleanup();

    openApp(signInLink());
    await user.click(await screen.findByRole("button", { name: "Switch" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
});

describe("a device whose saved data is unreadable", () => {
  it("starts over instead of failing to open", async () => {
    await openSignedIn("Juan");
    cleanup();
    for (const key of Object.keys(localStorage)) localStorage.setItem(key, "{not json");

    openApp("http://localhost:3000/#/");

    expect(await screen.findByText(/scan the invite QR code/)).toBeTruthy();
  });
});

describe("a database behind the app", () => {
  // Pinned on purpose: rolling the database back means deleting Drizzle's record of the latest
  // migration, so this test depends on how the migrator stores what it applied.
  it("asks for the database to be updated instead of opening", async () => {
    const [latest] = await sql<MigrationRow[]>`
      select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 1`;
    if (!latest) throw new Error("No migrations applied; run pnpm db:start");
    await sql`delete from drizzle.__drizzle_migrations where id = ${latest.id}`;
    try {
      openApp(signInLink());

      expect(await screen.findByRole("heading", { name: /needs an update/ })).toBeTruthy();
    } finally {
      await sql`insert into drizzle.__drizzle_migrations ${sql(latest, "id", "hash", "created_at")}`;
    }
  });
});

type MigrationRow = { id: number; hash: string; created_at: string };

async function openProfile() {
  await user.click(defined(screen.getAllByRole("link", { name: "Profile" })[0]));
}

async function chooseFormats(choices: { language?: string; numbers?: string }) {
  const card = within(await screen.findByRole("region", { name: "Language and formats" }));
  if (choices.language) await user.selectOptions(card.getByLabelText("Language"), choices.language);
  if (choices.numbers) await user.selectOptions(card.getByLabelText("Numbers"), choices.numbers);
  await user.click(card.getByRole("button", { name: "Save" }));
  await screen.findByText(/^(Saved|Guardado|Salvo)\.$/);
}

async function signUpAs(name: string) {
  await user.type(await screen.findByLabelText("Your name"), name);
  await user.type(screen.getByLabelText("Email"), uniqueEmail());
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Create account" }));
}
