// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  createSharedSpace,
  goHome,
  openApp,
  openNewAccount,
  openNewTransaction,
  openSignedIn,
  openSpaces,
  picked,
  recordTransaction,
  uniqueName,
  user,
} from "../support/app";
import { createAccount } from "../../src/accounts/account-writes";
import { defined, signedInAs, sql } from "../support/local-instance";

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

  it("leads back home from an account", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "0" });

    await user.click(screen.getByRole("link", { name: "Back to Home" }));

    expect(await screen.findByRole("region", { name: "Accounts" })).toBeTruthy();
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
    await user.click(screen.getByRole("link", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "History", level: 1 })).toBeTruthy();
    expect(
      await screen.findByText(
        new RegExp(`^${ana} changed the opening balance of “Checking” to -\\$25\\.10`),
      ),
    ).toBeTruthy();
  });

  it("lists an account's transactions on a screen of their own, and leads back to the account", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "" });
    await addAccount({ name: "Checking", openingBalance: "" });
    await recordTransaction({
      amount: "9",
      account: "Cash",
      category: "Gifts given",
      title: "Present",
    });
    await recordTransaction({
      amount: "4",
      account: "Checking",
      category: "Groceries",
      title: "Milk",
    });
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    await user.click(await accounts.findByRole("link", { name: /Checking/ }));
    await screen.findByRole("heading", { name: "Checking", level: 1 });
    expect(screen.queryByRole("link", { name: /Milk/ })).toBeNull();

    const account = within(screen.getByRole("navigation", { name: "Checking" }));
    await user.click(account.getByRole("link", { name: "Transactions" }));

    expect(await screen.findByRole("heading", { name: "Transactions", level: 1 })).toBeTruthy();
    expect(await screen.findByRole("link", { name: /Milk/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Present/ })).toBeNull();
    await user.click(screen.getByRole("link", { name: "Back to Checking" }));
    expect(await screen.findByRole("heading", { name: "Checking", level: 1 })).toBeTruthy();
  });

  it("asks for the opening balance again when the currency changes", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Savings", openingBalance: "100" });

    const details = within(screen.getByRole("region", { name: "Details" }));
    await user.clear(details.getByRole("combobox", { name: "Currency" }));
    await user.type(details.getByRole("combobox", { name: "Currency" }), "japan");
    expect(details.getAllByRole("option").map(({ textContent }) => textContent)).toEqual([
      "JPY · Japanese Yen",
    ]);
    await user.click(details.getByRole("option", { name: /^JPY · / }));

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

  it("refuses a blank account's name", async () => {
    await openSignedIn(uniqueName("Ana"));
    await openNewAccount();

    await user.type(screen.getByLabelText("Name"), "   ");
    await user.click(screen.getByRole("button", { name: "Add account" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "An account's name can't be blank.",
    );
  });

  it("says which account a name is taken by, archived or not, as the user types", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Spare", openingBalance: "" });
    const archive = within(screen.getByRole("region", { name: "Archive" }));
    await user.click(archive.getByRole("button", { name: "Archive account" }));
    await archive.findByRole("button", { name: "Unarchive" });
    await addAccount({ name: "Cash", openingBalance: "" });

    const details = within(screen.getByRole("region", { name: "Details" }));
    expect(details.getByRole("textbox", { name: "Name", description: "" })).toBeTruthy();
    await openNewAccount();
    await user.type(screen.getByLabelText("Name"), "  CASH");
    expect(
      screen.getByRole("textbox", {
        name: "Name",
        description: "This space already has an account named Cash.",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add account" }));
    expect(screen.getByRole("heading", { name: "New account", level: 1 })).toBeTruthy();

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "spare");

    expect(
      screen.getByRole("textbox", {
        name: "Name",
        description: "This space already has an archived account named Spare.",
      }),
    ).toBeTruthy();
  });

  it("refuses a name taken elsewhere while the form was open, until the name changes", async () => {
    const ana = await openSignedIn(uniqueName("Ana"));
    await openNewAccount();
    const elsewhere = await signedInAs(ana.email);
    const space = await elsewhere
      .from("spaces")
      .select("id")
      .eq("private_owner", ana.userId)
      .single();
    await createAccount(elsewhere, defined(space.data).id, {
      name: "Cash",
      currency: "USD",
      color: "blue",
      openingAmount: 0,
      openingDate: "2026-01-01",
    });

    await user.type(screen.getByLabelText("Name"), "Cash");
    await user.click(screen.getByRole("button", { name: "Add account" }));

    expect(
      await screen.findByRole("textbox", {
        name: "Name",
        description: "This space already has an account named Cash.",
      }),
    ).toBeTruthy();
    expect(screen.getAllByRole("alert").map(({ textContent }) => textContent)).toEqual([
      "This space already has an account named Cash.",
    ]);
    await user.type(screen.getByLabelText("Name"), " box");
    expect(screen.getByRole("textbox", { name: "Name", description: "" })).toBeTruthy();
  });

  it("archives an account holding money only once confirmed, and lists it apart", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Old card", openingBalance: "-40" });

    const archive = within(screen.getByRole("region", { name: "Archive" }));
    await user.click(archive.getByRole("button", { name: "Archive account" }));
    const dialog = within(screen.getByRole("dialog", { name: "Archive Old card?" }));
    expect(dialog.getByText(/Old card still holds -\$40\.00/)).toBeTruthy();
    await user.click(dialog.getByRole("button", { name: "Archive anyway" }));
    await archive.findByRole("button", { name: "Unarchive" });

    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect(accounts.queryByRole("link", { name: /Old card/ })).toBeNull();
    await user.click(await accounts.findByRole("button", { name: "Archived (1)" }));
    expect(accounts.getByRole("link", { name: /Old card/ })).toBeTruthy();
  });

  it("archives an account holding nothing straight away, and unarchives it", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Spare", openingBalance: "" });

    const archive = within(screen.getByRole("region", { name: "Archive" }));
    await user.click(archive.getByRole("button", { name: "Archive account" }));
    await user.click(await archive.findByRole("button", { name: "Unarchive" }));
    await archive.findByRole("button", { name: "Archive account" });

    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect(await accounts.findByRole("link", { name: /Spare/ })).toBeTruthy();
    expect(accounts.queryByRole("button", { name: /Archived/ })).toBeNull();
  });

  it("deletes an account once confirmed", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Mistake", openingBalance: "10" });

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    const dialog = within(screen.getByRole("dialog", { name: "Delete Mistake?" }));
    await user.click(dialog.getByRole("button", { name: "Delete" }));

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
    const family = uniqueName("Family");
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);
    await addAccount({ name: "Joint", space: family, openingBalance: "" });
    await addAccount({ name: "Wallet", space: "Private", openingBalance: "" });
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect(await accounts.findByRole("heading", { name: family })).toBeTruthy();

    await user.click(defined(screen.getAllByRole("button", { name: "All spaces" })[0]));
    await user.click(screen.getByRole("checkbox", { name: family }));

    expect(accounts.queryByRole("link", { name: /Joint/ })).toBeNull();
    expect(accounts.queryByRole("heading", { name: "Private" })).toBeNull();
    cleanup();
    openApp("http://localhost:3000/#/");
    const reopened = within(await screen.findByRole("region", { name: "Accounts" }));
    expect(await reopened.findByRole("link", { name: /Wallet/ })).toBeTruthy();
    expect(reopened.queryByRole("link", { name: /Joint/ })).toBeNull();
  });

  it("links to managing spaces", async () => {
    await openSignedIn(uniqueName("Ana"));

    await user.click(defined((await screen.findAllByRole("button", { name: "All spaces" }))[0]));
    await user.click(screen.getByRole("link", { name: "Manage spaces" }));

    expect(await screen.findByRole("heading", { name: "Spaces", level: 1 })).toBeTruthy();
  });
});

describe("forms", () => {
  describe("with the space picker narrowed to one space", () => {
    let family: string;

    beforeEach(async () => {
      family = uniqueName("Family");
      await openSignedIn(uniqueName("Ana"));
      await createSharedSpace(family, []);
      await addAccount({ name: "Joint", space: family, openingBalance: "" });
      await addAccount({ name: "Wallet", space: "Private", openingBalance: "" });
      await recordTransaction({ amount: "5", account: "Wallet", category: "Groceries" });
      await goHome();
      await hideSpace("Private");
    });

    it("put a new account in that space, grayed out", async () => {
      await openNewAccount();

      expect(spaceOptions()).toEqual([family]);
      expect(chosenOption("Space")).toBe(family);
      expect(screen.getByLabelText("Space")).toHaveProperty("disabled", true);
    });

    it("put a new counterparty in that space", async () => {
      const debts = within(await screen.findByRole("region", { name: "Debts" }));
      await user.click(debts.getByRole("link", { name: "Add a counterparty" }));

      expect(chosenOption(await screen.findByLabelText("Space"))).toBe(family);
      expect(spaceOptions()).toEqual([family]);
    });

    it("offer a new transaction only that space's accounts", async () => {
      await openNewTransaction();

      expect(picked("Account")).toBe("Joint");
      await user.click(screen.getByRole("combobox", { name: "Account" }));
      expect(screen.getAllByRole("option").map(({ textContent }) => textContent)).toEqual([
        expect.stringMatching(/^Joint/),
      ]);
    });
  });

  it("offer every space shown, and only those", async () => {
    const [family, trip] = [uniqueName("Family"), uniqueName("Trip")];
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);
    await createSharedSpace(trip, []);
    await goHome();
    await hideSpace(trip);

    await openNewAccount();

    expect(spaceOptions()).toEqual(["Private", family]);
    expect(screen.getByLabelText("Space")).toHaveProperty("disabled", false);
  });

  it("show the only space there is, grayed out", async () => {
    await openSignedIn(uniqueName("Ana"));

    await openNewAccount();

    expect(chosenOption("Space")).toBe("Private");
    expect(screen.getByLabelText("Space")).toHaveProperty("disabled", true);
  });

  it("keep offering a transaction's own account in a space the picker hides", async () => {
    const family = uniqueName("Family");
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);
    await addAccount({ name: "Wallet", space: "Private", openingBalance: "" });
    await recordTransaction({
      amount: "5",
      account: "Wallet",
      category: "Groceries",
      title: "Bread",
    });
    await user.click(await screen.findByRole("link", { name: /Bread/ }));

    await hideSpace("Private");

    expect(picked("Account")).toBe("Wallet");
  });

  it("give or take money from a counterparty's own space, even if the picker hides it", async () => {
    const family = uniqueName("Family");
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);
    await addAccount({ name: "Wallet", space: "Private", openingBalance: "100" });
    await goHome();
    const debts = within(await screen.findByRole("region", { name: "Debts" }));
    await user.click(debts.getByRole("link", { name: "Add a counterparty" }));
    await user.type(await screen.findByLabelText("Name"), "Charlie");
    await user.click(screen.getByRole("button", { name: "Add counterparty" }));
    await screen.findByRole("heading", { name: "Charlie", level: 1 });

    await hideSpace("Private");
    await user.click(screen.getByRole("link", { name: "I gave Charlie money" }));

    expect(await screen.findByRole("heading", { name: "New transaction" })).toBeTruthy();
    expect(picked("Account")).toBe("Wallet");
  });
});

describe("the spaces shown", () => {
  it("are all of them again once none of those chosen is left", async () => {
    const family = uniqueName("Family");
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);
    await addAccount({ name: "Wallet", space: "Private", openingBalance: "" });
    await goHome();
    await hideSpace("Private");
    await openSpaces();
    await user.click(await screen.findByRole("link", { name: new RegExp(`^${family}`) }));
    await user.click(await screen.findByRole("button", { name: "Delete space" }));
    const dialog = within(screen.getByRole("dialog", { name: `Delete ${family}?` }));
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    await screen.findByRole("heading", { name: "Spaces" });

    await goHome();

    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect(await accounts.findByRole("link", { name: /Wallet/ })).toBeTruthy();
  });
});

async function hideSpace(name: string) {
  await user.click(defined((await screen.findAllByRole("button", { name: "All spaces" }))[0]));
  await user.click(screen.getByRole("checkbox", { name }));
}

function spaceOptions(): (string | null)[] {
  return within(screen.getByLabelText("Space"))
    .getAllByRole("option")
    .map(({ textContent }) => textContent);
}

function chosenOption(field: string | HTMLElement): string | null {
  const select = typeof field === "string" ? screen.getByLabelText(field) : field;
  return within(select).getByRole("option", { selected: true }).textContent;
}

function balanceShown(): string {
  return within(screen.getByRole("region", { name: "Balance" })).getByText(/\d/).textContent;
}
