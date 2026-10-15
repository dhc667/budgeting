// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSharedSpace, openApp, openSignedIn, uniqueName, user } from "../support/app";
import { defined, sql } from "../support/local-instance";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(() => sql.end());

describe("accounts", () => {
  it("adds an account with its opening balance, and lists it on the dashboard", async () => {
    await openSignedIn(uniqueName("Ana"));

    await addAccount({ name: "Checking", openingBalance: "1500.50" });

    expect(await screen.findByRole("heading", { name: "Checking", level: 1 })).toBeTruthy();
    expect(balanceShown()).toMatch(/1,500\.50/);
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect((await accounts.findByRole("link", { name: /Checking/ })).textContent).toMatch(
      /1,500\.50/,
    );
  });

  it("edits the opening balance, and records it in the account's history", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Checking", openingBalance: "100" });

    const details = within(screen.getByRole("region", { name: "Details" }));
    await user.clear(details.getByLabelText("Opening balance"));
    await user.type(details.getByLabelText("Opening balance"), "-25.10");
    await user.click(details.getByRole("button", { name: "Save" }));

    expect(await details.findByText("Saved.")).toBeTruthy();
    expect(balanceShown()).toMatch(/-\$25\.10/);
    const history = within(screen.getByRole("region", { name: "History" }));
    expect(
      await history.findByText(
        new RegExp(`^${ana} changed the opening balance of “Checking” to -\\$25\\.10`),
      ),
    ).toBeTruthy();
  });

  it("asks for the opening balance again when the currency changes", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Savings", openingBalance: "100" });

    const details = within(screen.getByRole("region", { name: "Details" }));
    await user.selectOptions(details.getByLabelText("Currency"), "JPY");

    const amount = details.getByLabelText("Opening balance");
    expect(amount).toHaveProperty("value", "");
    await user.type(amount, "15000");
    await user.click(details.getByRole("button", { name: "Save" }));
    expect(await details.findByText("Saved.")).toBeTruthy();
    expect(balanceShown()).toMatch(/15,000/);
  });

  it("refuses an amount it can't read", async () => {
    await openSignedIn(uniqueName("Ana"));
    await openNewAccount();

    await user.type(screen.getByLabelText("Name"), "Cash");
    await user.type(screen.getByLabelText("Opening balance"), "12.345");
    await user.click(screen.getByRole("button", { name: "Add account" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/Enter an amount like/);
  });

  it("archives an account holding money only once confirmed, and lists it apart", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Old card", openingBalance: "-40" });

    const archive = within(screen.getByRole("region", { name: "Archive" }));
    await user.click(archive.getByRole("button", { name: "Archive account" }));
    expect(archive.getByText(/Old card still holds -\$40\.00/)).toBeTruthy();
    await user.click(archive.getByRole("button", { name: "Archive anyway" }));
    await archive.findByRole("button", { name: "Unarchive" });

    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect(accounts.queryByRole("link", { name: /Old card/ })).toBeNull();
    await user.click(await accounts.findByRole("button", { name: "Archived (1)" }));
    expect(accounts.getByRole("link", { name: /Old card/ })).toBeTruthy();
  });

  it("deletes an account once confirmed", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Mistake", openingBalance: "10" });

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.click(screen.getByRole("button", { name: "Delete Mistake" }));

    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect(await accounts.findByText(/No accounts yet/)).toBeTruthy();
  });

  it("reorders a space's accounts", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "First", openingBalance: "" });
    await addAccount({ name: "Second", openingBalance: "" });
    await goHome();

    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    await user.click(await accounts.findByRole("button", { name: "Edit order" }));
    await user.click(accounts.getByRole("button", { name: "Move Second up" }));

    const order = () =>
      accounts.getAllByText(/^(First|Second)$/).map(({ textContent }) => textContent);
    await expect.poll(order).toEqual(["Second", "First"]);
    await user.click(accounts.getByRole("button", { name: "Done" }));
    expect(accounts.getAllByRole("link", { name: /First|Second/ }).length).toBe(2);
  });
});

describe("the space picker", () => {
  it("narrows the dashboard to the spaces chosen, on this device", async () => {
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace("Family", []);
    await addAccount({ name: "Joint", space: "Family", openingBalance: "" });
    await addAccount({ name: "Wallet", space: "Private", openingBalance: "" });
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect(await accounts.findByRole("heading", { name: "Family" })).toBeTruthy();

    await user.click(defined(screen.getAllByRole("button", { name: "All spaces" })[0]));
    await user.click(screen.getByRole("checkbox", { name: "Family" }));

    expect(accounts.queryByRole("link", { name: /Joint/ })).toBeNull();
    expect(accounts.queryByRole("heading", { name: "Private" })).toBeNull();
    cleanup();
    openApp("http://localhost:3000/#/");
    const reopened = within(await screen.findByRole("region", { name: "Accounts" }));
    expect(await reopened.findByRole("link", { name: /Wallet/ })).toBeTruthy();
    expect(reopened.queryByRole("link", { name: /Joint/ })).toBeNull();
  });

  it("never narrows what forms offer", async () => {
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace("Family", []);
    await goHome();

    await user.click(defined((await screen.findAllByRole("button", { name: "All spaces" }))[0]));
    await user.click(screen.getByRole("checkbox", { name: "Family" }));
    await openNewAccount();

    const spaces = within(screen.getByLabelText("Space"));
    expect(spaces.getAllByRole("option").map(({ textContent }) => textContent)).toEqual([
      "Private",
      "Family",
    ]);
  });
});

type NewAccount = { name: string; openingBalance: string; space?: string };

async function addAccount({ name, openingBalance, space }: NewAccount) {
  await openNewAccount();
  if (space) await user.selectOptions(screen.getByLabelText("Space"), space);
  await user.type(screen.getByLabelText("Name"), name);
  if (openingBalance) await user.type(screen.getByLabelText("Opening balance"), openingBalance);
  await user.click(screen.getByRole("button", { name: "Add account" }));
  await screen.findByRole("heading", { name, level: 1 });
}

async function openNewAccount() {
  await goHome();
  await user.click(await screen.findByRole("link", { name: "Add account" }));
  await screen.findByRole("heading", { name: "New account" });
}

async function goHome() {
  await user.click(defined(screen.getAllByRole("link", { name: "Home" })[0]));
}

function balanceShown(): string {
  return within(screen.getByRole("region", { name: "Balance" })).getByText(/\d/).textContent;
}
