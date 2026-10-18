// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

// The provider is unreachable: the display currency list comes from the rates the instance holds.
vi.mock("../../src/rates/rates-provider", async () => {
  const { offlineProvider } = await import("../support/rates-provider");
  return offlineProvider;
});

let seededRate = false;
const goingStale = "XTS";

beforeAll(async () => {
  await sql`insert into currencies (code, decimals) values (${goingStale}, 2) on conflict do nothing`;
  await sql`insert into exchange_rates (date, currency, rate) values (current_date, ${goingStale}, 3)
    on conflict (date, currency) do nothing`;
  const inserted =
    await sql`insert into exchange_rates (date, currency, rate) values (current_date, 'EUR', 0.9) on conflict do nothing returning 1`;
  seededRate = inserted.length > 0;
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(async () => {
  await sql`delete from exchange_rates where currency = ${goingStale}`;
  if (seededRate)
    await sql`delete from exchange_rates where date = current_date and currency = 'EUR'`;
  await sql.end();
});

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

  it("refuses a password confirmation that doesn't match, leaving the invite unused", async () => {
    openApp(await inviteLink());

    await signUpAs("Ana", { repeated: "a different password" });

    expect((await screen.findByRole("alert")).textContent).toMatch(/don't match/);
    await user.clear(screen.getByLabelText("Repeat password"));
    await user.type(screen.getByLabelText("Repeat password"), password);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("heading", { name: /, Ana$/ })).toBeTruthy();
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
    await user.click(card.getByRole("combobox", { name: "Display currency" }));
    await user.click(card.getByRole("option", { name: /^EUR · / }));
    await user.click(card.getByRole("button", { name: "Save" }));
    await card.findByText("Saved.");

    await user.click(defined(screen.getAllByRole("link", { name: "Home" })[0]));

    expect(await screen.findByRole("heading", { name: /, Daniela$/ })).toBeTruthy();
    expect(screen.getByText("€0.00")).toBeTruthy();
  });

  it("explains a display currency refused because its rate went stale meanwhile", async () => {
    const card = within(await screen.findByRole("region", { name: "About you" }));
    await sql`update exchange_rates set date = current_date - 30 where currency = ${goingStale}`;
    await user.click(card.getByRole("combobox", { name: "Display currency" }));
    await user.click(await card.findByRole("option", { name: new RegExp(`^${goingStale} · `) }));
    await user.click(card.getByRole("button", { name: "Save" }));

    expect((await card.findByRole("alert")).textContent).toMatch(/no recent exchange rate/);
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

    expect(
      await screen.findByRole("heading", { name: "Sign in" }, { timeout: 5_000 }),
    ).toBeTruthy();
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
    await screen.findByRole("heading", { name: "Can't reach your budget" }, { timeout: 5000 });
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

async function signUpAs(name: string, { repeated = password } = {}) {
  await user.type(await screen.findByLabelText("Your name"), name);
  await user.type(screen.getByLabelText("Email"), uniqueEmail());
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Repeat password"), repeated);
  await user.click(screen.getByRole("button", { name: "Create account" }));
}
