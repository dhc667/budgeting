// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  choose,
  goHome,
  openNewTransaction,
  openSignedIn,
  uniqueName,
  user,
} from "../support/app";
import { sql } from "../support/local-instance";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(() => sql.end());

describe("debts", () => {
  it("lends to a counterparty, then shows how much of it was paid back", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });
    await addCounterparty("Charlie");

    await user.click(screen.getByRole("link", { name: "I gave Charlie money" }));
    await user.type(await screen.findByLabelText("Amount"), "30");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    await screen.findByRole("heading", { name: "Charlie", level: 1 });
    await user.click(screen.getByRole("link", { name: "Charlie gave me money" }));
    await user.type(await screen.findByLabelText("Amount"), "10");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    const balance = within(await screen.findByRole("region", { name: "Balance" }));
    expect(await balance.findByText("Owes you $20.00")).toBeTruthy();
    expect(balance.getByText(/\$10\.00 of \$30\.00 paid back/)).toBeTruthy();
    await goHome();
    const debts = within(await screen.findByRole("region", { name: "Debts" }));
    expect((await debts.findByRole("link", { name: /Charlie/ })).textContent).toMatch(
      /Owes you \$20\.00/,
    );
    const accounts = within(screen.getByRole("region", { name: "Accounts" }));
    expect(accounts.getByRole("link", { name: /Cash/ }).textContent).toMatch(/\$80\.00/);
  });

  it("records money borrowed from the transaction form's Debt tab", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "" });
    await addCounterparty("Acme Corp");

    await openNewTransaction();
    await user.click(screen.getByRole("tab", { name: "Debt" }));
    await user.click(screen.getByRole("radio", { name: /I received/ }));
    await user.type(screen.getByLabelText("Amount"), "250");
    await choose("Account", "Cash");
    await choose("Counterparty", "Acme Corp");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    const list = await screen.findByRole("link", { name: /Acme Corp/ });
    expect(list.textContent).toMatch(/\+\$250\.00/);
    await goHome();
    const debts = within(await screen.findByRole("region", { name: "Debts" }));
    expect((await debts.findByRole("link", { name: /Acme Corp/ })).textContent).toMatch(
      /You owe \$250\.00/,
    );
  });

  it("adds a counterparty typed into the form when the transaction is saved", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });

    await openNewTransaction();
    await user.click(screen.getByRole("tab", { name: "Debt" }));
    await user.type(screen.getByLabelText("Amount"), "40");
    await user.type(screen.getByRole("combobox", { name: "Counterparty" }), "Jorge");
    await user.click(screen.getByRole("option", { name: "Add “Jorge”" }));
    expect(screen.getByText("“Jorge” is added as a counterparty when you save.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    expect((await screen.findByRole("link", { name: /Jorge/ })).textContent).toMatch(/-\$40\.00/);
    await goHome();
    const debts = within(await screen.findByRole("region", { name: "Debts" }));
    expect((await debts.findByRole("link", { name: /Jorge/ })).textContent).toMatch(
      /Owes you \$40\.00/,
    );
  });

  it("deletes a counterparty only while no money has moved with it", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "50" });
    await addCounterparty("Charlie");

    await user.click(screen.getByRole("button", { name: "Delete counterparty" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    const debts = within(await screen.findByRole("region", { name: "Debts" }));
    expect(debts.queryByRole("link", { name: /Charlie/ })).toBeNull();
  });
});

async function addCounterparty(name: string) {
  await goHome();
  const debts = within(await screen.findByRole("region", { name: "Debts" }));
  await user.click(debts.getByRole("link", { name: "Add a counterparty" }));
  await user.type(await screen.findByLabelText("Name"), name);
  await user.click(screen.getByRole("button", { name: "Add counterparty" }));
  await screen.findByRole("heading", { name, level: 1 });
}
