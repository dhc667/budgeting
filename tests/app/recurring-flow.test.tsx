// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  choose,
  goHome,
  openApp,
  openNewTransaction,
  openSignedIn,
  uniqueName,
  user,
} from "../support/app";
import { daysAgo } from "../support/dates";
import { defined, sql } from "../support/local-instance";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(() => sql.end());

describe("recurring transactions", () => {
  it("saves a transaction and repeats it, the next one due a month later", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });

    await openNewTransaction();
    await user.type(screen.getByLabelText("Title"), "Rent");
    await user.type(screen.getByLabelText("Amount"), "50");
    await choose("Category", "Bills & utilities");
    await user.click(screen.getByLabelText(/Repeat/));
    await user.click(screen.getByRole("button", { name: "Save and repeat" }));

    await screen.findByRole("heading", { name: "Recurring transactions", level: 1 });
    const rules = within(screen.getByRole("main"));
    expect((await rules.findByRole("link", { name: /Rent/ })).textContent).toMatch(
      /-\$50\.00.*Every month/,
    );
    await goHome();
    expect(await balanceOf("Checking")).toMatch(/\$50\.00/);
    expect(screen.queryByRole("region", { name: "Upcoming" })).toBeNull();
  });

  it("repeats from today without recording, then records the one due at its real amount", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await repeatFromToday({ title: "Electricity", amount: "80" });

    await goHome();
    expect(await balanceOf("Checking")).toMatch(/\$100\.00/);
    const upcoming = within(await screen.findByRole("region", { name: "Upcoming" }));
    expect(upcoming.getByText("Electricity")).toBeTruthy();
    await user.click(upcoming.getByRole("button", { name: "Record" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Record “Electricity”" }));
    const amount = dialog.getByLabelText("Amount");
    expect(amount).toHaveProperty("value", "80.00");
    await user.clear(amount);
    await user.type(amount, "92.50");
    await user.click(dialog.getByRole("button", { name: "Record" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Upcoming" })).toBeNull());
    expect(await balanceOf("Checking")).toMatch(/\$7\.50/);
  });

  it("skips the one due, leaving the balance as it was", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Checking", openingBalance: "100" });
    await repeatFromToday({ title: "Gym", amount: "30" });

    await goHome();
    const upcoming = within(await screen.findByRole("region", { name: "Upcoming" }));
    await user.click(upcoming.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Upcoming" })).toBeNull());
    expect(await balanceOf("Checking")).toMatch(/\$100\.00/);
    await openRule("Gym");
    const history = within(screen.getByRole("region", { name: "History" }));
    expect(await history.findByText(new RegExp(`^${ana} skipped “Gym” due `))).toBeTruthy();
  });

  it("edits a recurring transaction, which its history shows", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Checking", openingBalance: "100" });
    await repeatFromToday({ title: "Rent", amount: "50" });

    await user.click(await screen.findByRole("link", { name: /Rent/ }));
    await screen.findByRole("heading", { name: "Rent", level: 1 });
    const details = within(screen.getByRole("region", { name: "Details" }));
    await user.clear(details.getByLabelText("Amount"));
    await user.type(details.getByLabelText("Amount"), "55");
    await user.click(details.getByRole("button", { name: "Save" }));

    expect(await details.findByText("Saved.")).toBeTruthy();
    const history = within(screen.getByRole("region", { name: "History" }));
    expect(
      await history.findByText(`${ana} changed the recurring transaction “Rent”`),
    ).toBeTruthy();
    expect(history.getByText(`${ana} created the recurring transaction “Rent”`)).toBeTruthy();
  });

  it("pauses an overdue one, and resumes leaving out what fell due meanwhile", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Checking", openingBalance: "100" });
    await repeatFrom(daysAgo(70), { title: "Gym", amount: "30" });
    await goHome();
    expect(await screen.findByRole("region", { name: "Upcoming" })).toBeTruthy();

    await openRule("Gym");
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(await screen.findByRole("button", { name: "Resume" }));
    await screen.findByRole("button", { name: "Pause" });

    const history = within(screen.getByRole("region", { name: "History" }));
    expect(await history.findByText(`${ana} resumed the recurring transaction “Gym”`)).toBeTruthy();
    expect(history.getByText(`${ana} paused the recurring transaction “Gym”`)).toBeTruthy();
    await goHome();
    await screen.findByRole("region", { name: "Accounts" });
    expect(screen.queryByRole("region", { name: "Upcoming" })).toBeNull();
  });

  it("deletes a recurring transaction once confirmed", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await repeatFromToday({ title: "Rent", amount: "50" });

    await openRule("Rent");
    await user.click(screen.getByRole("button", { name: "Delete recurring transaction" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Delete “Rent”?" }));
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    await screen.findByRole("heading", { name: "Recurring transactions", level: 1 });
    expect(await screen.findByText(/No recurring transactions yet/)).toBeTruthy();
  });

  it("shows on the dashboard what's due in the next 7 days, or as far ahead as chosen", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Checking", openingBalance: "100" });
    await repeatFrom(daysAgo(-3), { title: "Insurance", amount: "20" });

    await goHome();
    const upcoming = within(await screen.findByRole("region", { name: "Upcoming" }));
    expect(upcoming.getByText("Insurance")).toBeTruthy();
    await user.selectOptions(upcoming.getByLabelText("Show on the dashboard"), "What's due");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Upcoming" })).toBeNull());

    cleanup();
    openApp("http://localhost:3000/#/recurring");
    await screen.findByRole("heading", { name: "Recurring transactions", level: 1 });
    const showing = await screen.findByLabelText("Show on the dashboard");
    expect(showing).toHaveProperty("value", "0");
    await user.selectOptions(showing, "Due within 14 days");
    await waitFor(() => expect(showing).toHaveProperty("value", "14"));
    await goHome();
    expect(await screen.findByRole("region", { name: "Upcoming" })).toBeTruthy();
  });
});

async function repeatFrom(day: string, transaction: { title: string; amount: string }) {
  await openNewTransaction();
  await user.type(screen.getByLabelText("Title"), transaction.title);
  await user.type(screen.getByLabelText("Amount"), transaction.amount);
  await choose("Category", "Bills & utilities");
  await user.click(screen.getByLabelText(/Repeat/));
  await user.clear(screen.getByLabelText("Starts on"));
  await user.type(screen.getByLabelText("Starts on"), day);
  await user.click(screen.getByRole("button", { name: "Repeat from then" }));
  await screen.findByRole("heading", { name: "Recurring transactions", level: 1 });
}

async function openRule(title: string) {
  await user.click(defined(screen.getAllByRole("link", { name: "Transactions" })[0]));
  await user.click(await screen.findByRole("link", { name: "Recurring" }));
  await user.click(await screen.findByRole("link", { name: new RegExp(title) }));
  await screen.findByRole("heading", { name: title, level: 1 });
}

async function repeatFromToday({ title, amount }: { title: string; amount: string }) {
  await openNewTransaction();
  await user.type(screen.getByLabelText("Title"), title);
  await user.type(screen.getByLabelText("Amount"), amount);
  await choose("Category", "Bills & utilities");
  await user.click(screen.getByLabelText(/Repeat/));
  await user.click(screen.getByRole("button", { name: "Repeat from then" }));
  await screen.findByRole("heading", { name: "Recurring transactions", level: 1 });
}

async function balanceOf(account: string): Promise<string | null> {
  const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
  return (await accounts.findByRole("link", { name: new RegExp(account) })).textContent;
}
