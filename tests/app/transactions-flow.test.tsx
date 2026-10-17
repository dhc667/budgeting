// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  choose,
  createSharedSpace,
  goHome,
  openApp,
  openNewTransaction,
  openSignedIn,
  openSpaces,
  recordTransaction,
  signIn,
  uniqueName,
  user,
} from "../support/app";
import { defined, existingUser, password, signInLink, sql } from "../support/local-instance";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(() => sql.end());

describe("transactions", () => {
  it("records an expense, which lowers the account's balance", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });

    await recordTransaction({ amount: "25.50", category: "Groceries", title: "Market" });

    const list = within(screen.getByRole("main"));
    expect((await list.findByRole("link", { name: /Market/ })).textContent).toMatch(/-\$25\.50/);
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect((await accounts.findByRole("link", { name: /Checking/ })).textContent).toMatch(
      /\$74\.50/,
    );
    const recent = within(screen.getByRole("region", { name: "Recent transactions" }));
    expect(await recent.findByRole("link", { name: /Market/ })).toBeTruthy();
  });

  it("records a refund, which gives money back to the account", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });

    await recordTransaction({
      type: "Refund",
      amount: "20",
      category: "Shopping",
      title: "Returned shoes",
    });

    const list = within(screen.getByRole("main"));
    expect((await list.findByRole("link", { name: /Returned shoes/ })).textContent).toMatch(
      /\+\$20\.00/,
    );
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect((await accounts.findByRole("link", { name: /Checking/ })).textContent).toMatch(
      /\$120\.00/,
    );
  });

  it("turns an expense into a refund, which gives the money back", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Checking", openingBalance: "100" });
    await recordTransaction({ amount: "25.50", category: "Shopping", title: "Shoes" });

    await user.click(await screen.findByRole("link", { name: /Shoes/ }));
    const details = within(await screen.findByRole("region", { name: "Details" }));
    await user.click(details.getByLabelText(/Refund/));
    await user.click(details.getByRole("button", { name: "Save" }));

    expect(await details.findByText("Saved.")).toBeTruthy();
    const history = within(screen.getByRole("region", { name: "History" }));
    expect(
      await history.findByText(
        new RegExp(`^${ana} changed “Shoes” from an expense .* to a refund`),
      ),
    ).toBeTruthy();
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect((await accounts.findByRole("link", { name: /Checking/ })).textContent).toMatch(
      /\$125\.50/,
    );
  });

  it("transfers between spaces, which a member of one sees but can't change", async () => {
    const ben = uniqueName("Ben");
    const family = uniqueName("Family");
    const benUser = await existingUser(ben);
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, [ben]);
    await addAccount({ name: "Joint", space: family, openingBalance: "" });
    await addAccount({ name: "Wallet", space: "Private", openingBalance: "100" });

    await recordTransaction({ type: "Transfer", amount: "40", account: "Wallet", to: "Joint" });

    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect((await accounts.findByRole("link", { name: /Wallet/ })).textContent).toMatch(/\$60\.00/);
    expect(accounts.getByRole("link", { name: /Joint/ }).textContent).toMatch(/\$40\.00/);

    cleanup();
    localStorage.clear();
    openApp(signInLink());
    await signIn(benUser.email, password);
    await user.click(defined((await screen.findAllByRole("link", { name: "Transactions" }))[0]));
    await user.click(await screen.findByRole("link", { name: /Transfer/ }));
    expect(await screen.findByText("From another space to “Joint”")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete transaction" })).toBeNull();
  });

  it("starts from the last account used, and suggests the category a title had", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "" });
    await addAccount({ name: "Cash", openingBalance: "" });
    await recordTransaction({
      amount: "3",
      account: "Cash",
      category: "Eating out",
      title: "Bakery",
    });

    await openNewTransaction();
    await user.type(screen.getByLabelText("Title"), " bakery ");

    expect(picked("Account")).toMatch(/^Cash/);
    expect(picked("Category")).toBe("Eating out");
    await choose("Category", "Groceries");
    await user.type(screen.getByLabelText("Title"), "s");
    expect(picked("Category")).toBe("Groceries");
  });

  it("fills in what a past title was last time, once picked", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "" });
    await addAccount({ name: "Cash", openingBalance: "" });
    await recordTransaction({
      amount: "3",
      account: "Cash",
      category: "Eating out",
      title: "Bakery",
    });
    await recordTransaction({
      type: "Income",
      amount: "1000",
      account: "Checking",
      category: "Salary",
      title: "Payday",
    });

    await openNewTransaction();
    await user.type(screen.getByLabelText("Title"), "bak");
    const suggestion = screen.getByRole("option", { name: /^Bakery/ });
    expect(suggestion.textContent).toMatch(/Eating out · Cash.*-\$3\.00/);
    await user.click(suggestion);

    expect(screen.getByLabelText<HTMLInputElement>("Title").value).toBe("Bakery");
    expect(screen.getByLabelText<HTMLInputElement>("Amount").value).toBe("3.00");
    expect(picked("Account")).toMatch(/^Cash/);
    expect(picked("Category")).toBe("Eating out");

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "pay");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("tab", { name: "Income", selected: true })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Amount").value).toBe("1,000.00");
    expect(picked("Account")).toMatch(/^Checking/);
    expect(picked("Category")).toBe("Salary");
  });

  it("drops a category from another space when the account changes", async () => {
    const family = uniqueName("Family");
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);
    await addAccount({ name: "Joint", space: family, openingBalance: "" });
    await addAccount({ name: "Wallet", space: "Private", openingBalance: "" });

    await openNewTransaction();
    await choose("Account", "Wallet");
    await choose("Category", "Groceries");
    await choose("Account", "Joint");

    expect(picked("Category")).toBe("Choose a category");
  });

  it("deletes a transaction once confirmed, and returns to the list", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "" });
    await recordTransaction({ amount: "9", category: "Gifts given", title: "Mistake" });

    await user.click(await screen.findByRole("link", { name: /Mistake/ }));
    await user.click(await screen.findByRole("button", { name: "Delete transaction" }));
    const dialog = within(screen.getByRole("dialog", { name: "Delete “Mistake”?" }));
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("No transactions yet.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Transactions", level: 1 })).toBeTruthy();
  });

  it("restores a deleted transaction from its account's history", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Checking", openingBalance: "100" });
    await recordTransaction({ amount: "9", category: "Gifts given", title: "Present" });
    await user.click(await screen.findByRole("link", { name: /Present/ }));
    await user.click(await screen.findByRole("button", { name: "Delete transaction" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await screen.findByText("No transactions yet.");

    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    await user.click(await accounts.findByRole("link", { name: /Checking/ }));
    await user.click(await screen.findByRole("link", { name: "History" }));
    await user.click(await screen.findByRole("button", { name: "Restore" }));

    expect(await screen.findByText(new RegExp(`^${ana} restored “Present”`))).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    await goHome();
    const restored = within(await screen.findByRole("region", { name: "Accounts" }));
    expect((await restored.findByRole("link", { name: /Checking/ })).textContent).toMatch(
      /\$91\.00/,
    );
  });

  it("restores a deleted transaction from its space's activity", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Checking", openingBalance: "" });
    await recordTransaction({ amount: "9", category: "Gifts given", title: "Present" });
    await user.click(await screen.findByRole("link", { name: /Present/ }));
    await user.click(await screen.findByRole("button", { name: "Delete transaction" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await screen.findByText("No transactions yet.");

    await openSpaces();
    await user.click(await screen.findByRole("link", { name: /^Private/ }));
    await user.click(await screen.findByRole("link", { name: "Activity" }));
    await user.click(await screen.findByRole("button", { name: "Restore" }));

    expect(await screen.findByText(new RegExp(`^${ana} restored “Present”`))).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it("refuses an amount that isn't above zero", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "" });
    await openNewTransaction();

    await user.type(screen.getByLabelText("Amount"), "0");
    await choose("Category", "Groceries");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/above zero/);
  });
});

function picked(picker: string): string | null {
  return screen.getByRole("combobox", { name: picker }).textContent;
}
