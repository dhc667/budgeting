// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  choose,
  goHome,
  openNewTransaction,
  openSignedIn,
  picked,
  uniqueName,
  user,
} from "../support/app";
import { createCounterparty } from "../../src/counterparties/counterparty-writes";
import { defined, signedInAs, sql } from "../support/local-instance";

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

  it("lists each currency owed, and tucks settled counterparties away", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });
    await addAccount({ name: "Euros", openingBalance: "100", currency: "EUR" });
    await addCounterparty("Charlie");
    await give("Charlie", "Cash", "30");
    await give("Charlie", "Euros", "20");
    await addCounterparty("Dana");
    await give("Dana", "Cash", "10");
    await user.click(screen.getByRole("link", { name: "Dana gave me money" }));
    await user.click(await screen.findByRole("button", { name: "Add transaction" }));
    await screen.findByRole("heading", { name: "Dana", level: 1 });

    await goHome();
    const debts = within(await screen.findByRole("region", { name: "Debts" }));
    const charlie = await debts.findByRole("link", { name: /Charlie/ });
    expect(within(charlie).getByText("Owes you")).toBeTruthy();
    expect(within(charlie).getByText("€20.00")).toBeTruthy();
    expect(within(charlie).getByText("$30.00")).toBeTruthy();
    expect(debts.queryByRole("link", { name: /Dana/ })).toBeNull();
    await user.click(debts.getByRole("button", { name: "Settled (1)" }));
    expect(debts.getByRole("link", { name: /Dana/ })).toBeTruthy();
  });

  it("records money borrowed from the transaction form's Debt tab", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "" });
    await addCounterparty("Acme Corp");

    await openNewTransaction();
    await user.click(screen.getByRole("tab", { name: "Debt" }));
    expect(screen.queryByRole("radio", { name: /forgave/ })).toBeNull();
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

  it("fills in all that's owed when the money pays a debt back", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });
    await addCounterparty("Charlie");
    await user.click(screen.getByRole("link", { name: "I gave Charlie money" }));
    await user.type(await screen.findByLabelText("Amount"), "30");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    await screen.findByRole("heading", { name: "Charlie", level: 1 });

    await user.click(screen.getByRole("link", { name: "Charlie gave me money" }));
    const amount = await screen.findByLabelText<HTMLInputElement>("Amount");
    expect(amount.value).toBe("30.00");
    await user.type(amount, "12");
    expect(amount.value).toBe("12");
    await user.click(screen.getByRole("button", { name: "All that's owed: 30.00 USD" }));
    expect(amount.value).toBe("30.00");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    const balance = within(await screen.findByRole("region", { name: "Balance" }));
    expect(await balance.findByText("Settled in USD")).toBeTruthy();
  });

  it("settles a debt with money paid back in another currency", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });
    await addAccount({ name: "Euros", openingBalance: "100", currency: "EUR" });
    await addCounterparty("Charlie");
    await give("Charlie", "Cash", "30");

    await user.click(screen.getByRole("link", { name: "Charlie gave me money" }));
    await choose("Account", "Euros");
    await user.type(await screen.findByLabelText("Amount"), "27");
    await user.click(screen.getByRole("button", { name: "In another currency" }));
    await choose("Debt in", "USD · US Dollar");
    await user.type(screen.getByLabelText("Debt amount"), "30");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    const balance = within(await screen.findByRole("region", { name: "Balance" }));
    expect(await balance.findByText("Settled in USD")).toBeTruthy();
    expect(balance.queryByText(/forgiven/)).toBeNull();
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect((await accounts.findByRole("link", { name: /Euros/ })).textContent).toMatch(/€127\.00/);
    expect(accounts.getByRole("link", { name: /Cash/ }).textContent).toMatch(/\$70\.00/);
  });

  it("lends money from an account in another currency than the debt's", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Euros", openingBalance: "100", currency: "EUR" });
    await addCounterparty("Charlie");

    await user.click(screen.getByRole("link", { name: "I gave Charlie money" }));
    await user.type(await screen.findByLabelText("Amount"), "27");
    await user.click(screen.getByRole("button", { name: "In another currency" }));
    await choose("Debt in", "USD · US Dollar");
    await user.type(screen.getByLabelText("Debt amount"), "30");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    const balance = within(await screen.findByRole("region", { name: "Balance" }));
    expect(await balance.findByText("Owes you $30.00")).toBeTruthy();
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect((await accounts.findByRole("link", { name: /Euros/ })).textContent).toMatch(/€73\.00/);
  });

  it("fills in all that's owed in another currency, leaving what moved to the user", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });
    await addAccount({ name: "Euros", openingBalance: "100", currency: "EUR" });
    await addCounterparty("Charlie");
    await give("Charlie", "Cash", "30");

    await user.click(screen.getByRole("link", { name: "Charlie gave me money" }));
    await choose("Account", "Euros");
    await user.click(await screen.findByRole("button", { name: "All that's owed: 30.00 USD" }));

    expect(picked("Debt in")).toBe("USD · US Dollar");
    expect(screen.getByLabelText<HTMLInputElement>("Debt amount").value).toBe("30.00");
    const amount = screen.getByLabelText<HTMLInputElement>("Amount");
    expect(amount.value).toBe("");
    await user.type(amount, "27");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    const balance = within(await screen.findByRole("region", { name: "Balance" }));
    expect(await balance.findByText("Settled in USD")).toBeTruthy();
  });

  it("edits money paid back in another currency with both its amounts", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });
    await addAccount({ name: "Euros", openingBalance: "100", currency: "EUR" });
    await addCounterparty("Charlie");
    await give("Charlie", "Cash", "30");
    await user.click(screen.getByRole("link", { name: "Charlie gave me money" }));
    await user.type(await screen.findByLabelText("Title"), "Paid back");
    await choose("Account", "Euros");
    await user.type(screen.getByLabelText("Amount"), "27");
    await user.click(screen.getByRole("button", { name: "In another currency" }));
    await choose("Debt in", "USD · US Dollar");
    await user.type(screen.getByLabelText("Debt amount"), "30");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    await user.click(await screen.findByRole("link", { name: /Paid back/ }));
    const history = within(await screen.findByRole("region", { name: "History" }));
    expect(
      await history.findByText(
        /€27\.00 received into “Euros” from “Charlie”, for \$30\.00 of the debt, on/,
      ),
    ).toBeTruthy();
    const details = within(await screen.findByRole("region", { name: "Details" }));
    expect(details.getByLabelText<HTMLInputElement>("Amount").value).toBe("27.00");
    expect(picked("Debt in")).toBe("USD · US Dollar");
    const debtAmount = details.getByLabelText<HTMLInputElement>("Debt amount");
    expect(debtAmount.value).toBe("30.00");
    await user.clear(debtAmount);
    await user.type(debtAmount, "25");
    await user.click(details.getByRole("button", { name: "Save" }));

    expect(await details.findByText("Saved.")).toBeTruthy();
    await goHome();
    const debts = within(await screen.findByRole("region", { name: "Debts" }));
    expect((await debts.findByRole("link", { name: /Charlie/ })).textContent).toMatch(
      /Owes you \$5\.00/,
    );
  });

  it("lists money paid back in another currency by what it took off the debt", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });
    await addAccount({ name: "Euros", openingBalance: "100", currency: "EUR" });
    await addCounterparty("Charlie");
    await give("Charlie", "Cash", "30");
    await user.click(screen.getByRole("link", { name: "Charlie gave me money" }));
    await user.type(await screen.findByLabelText("Title"), "Paid back");
    await choose("Account", "Euros");
    await user.type(screen.getByLabelText("Amount"), "27");
    await user.click(screen.getByRole("button", { name: "In another currency" }));
    await choose("Debt in", "USD · US Dollar");
    await user.type(screen.getByLabelText("Debt amount"), "30");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    const paidBack = await screen.findByRole("link", { name: /Paid back/ });
    expect(paidBack.textContent).toMatch(/\+\$30\.00/);
    await goHome();
    const recent = within(await screen.findByRole("region", { name: "Recent transactions" }));
    expect((await recent.findByRole("link", { name: /Paid back/ })).textContent).toMatch(
      /\+€27\.00/,
    );
  });

  it("takes money paid back into the account the debt went out of", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });
    await addAccount({ name: "Bank", openingBalance: "100" });
    await addCounterparty("Charlie");
    await addCounterparty("Dora");
    await give("Charlie", "Cash", "30");
    await give("Dora", "Bank", "5");
    await goHome();
    const debts = within(await screen.findByRole("region", { name: "Debts" }));
    await user.click(await debts.findByRole("link", { name: /Charlie/ }));

    await user.click(await screen.findByRole("link", { name: "Charlie gave me money" }));

    expect((await screen.findByLabelText<HTMLInputElement>("Amount")).value).toBe("30.00");
    expect(picked("Account")).toBe("Cash");
  });

  it("forgives a debt across accounts, which keep their money", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addAccount({ name: "Cash", openingBalance: "100" });
    await addAccount({ name: "Bank", openingBalance: "100" });
    await addCounterparty("Charlie");
    await give("Charlie", "Cash", "30");
    await give("Charlie", "Bank", "20");

    await user.click(screen.getByRole("link", { name: "Forgive" }));
    const debt = within(await screen.findByRole("group", { name: "Owes you $50.00" }));
    const [bank, cash] = debt.getAllByLabelText<HTMLInputElement>("Forgive");
    expect([bank?.value, cash?.value]).toEqual(["20.00", "30.00"]);
    await user.clear(defined(cash));
    await user.type(defined(cash), "10");
    expect(debt.getByText("After this: Owes you $20.00")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Forgive" }));

    const balance = within(await screen.findByRole("region", { name: "Balance" }));
    expect(await balance.findByText("Owes you $20.00")).toBeTruthy();
    expect(balance.getByText(/forgiven \$30\.00/)).toBeTruthy();
    expect(
      (await screen.findAllByRole("link", { name: /Debts forgiven · Bank/ }))[0]?.textContent,
    ).toMatch(/\$20\.00/);
    await goHome();
    const accounts = within(await screen.findByRole("region", { name: "Accounts" }));
    expect((await accounts.findByRole("link", { name: /Cash/ })).textContent).toMatch(/\$70\.00/);
    expect(accounts.getByRole("link", { name: /Bank/ }).textContent).toMatch(/\$80\.00/);
  });

  it("says which counterparty a name is taken by, as the user types", async () => {
    await openSignedIn(uniqueName("Ana"));
    await addCounterparty("Charlie");

    const details = within(screen.getByRole("region", { name: "Counterparty" }));
    expect(details.getByRole("textbox", { name: "Name", description: nameHint })).toBeTruthy();
    await openNewCounterparty();
    await user.type(screen.getByLabelText("Name"), "charlie ");
    expect(
      screen.getByRole("textbox", {
        name: "Name",
        description: `${nameHint} This space already has a counterparty named Charlie.`,
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add counterparty" }));

    expect(screen.getByRole("heading", { name: "New counterparty", level: 1 })).toBeTruthy();
  });

  it("refuses a counterparty's name taken elsewhere while the form was open", async () => {
    const ana = await openSignedIn(uniqueName("Ana"));
    await openNewCounterparty();
    const elsewhere = await signedInAs(ana.email);
    const space = await elsewhere
      .from("spaces")
      .select("id")
      .eq("private_owner", ana.userId)
      .single();
    await createCounterparty(elsewhere, defined(space.data).id, { name: "Dana", color: "slate" });

    await user.type(screen.getByLabelText("Name"), "Dana");
    await user.click(screen.getByRole("button", { name: "Add counterparty" }));

    expect(
      await screen.findByRole("textbox", {
        name: "Name",
        description: `${nameHint} This space already has a counterparty named Dana.`,
      }),
    ).toBeTruthy();
    expect(screen.getAllByRole("alert").map(({ textContent }) => textContent)).toEqual([
      "This space already has a counterparty named Dana.",
    ]);
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

async function give(counterparty: string, account: string, amount: string) {
  await openNewTransaction();
  await user.click(screen.getByRole("tab", { name: "Debt" }));
  await user.type(screen.getByLabelText("Amount"), amount);
  await choose("Account", account);
  await choose("Counterparty", counterparty);
  await user.click(screen.getByRole("button", { name: "Add transaction" }));
  await screen.findByRole("heading", { name: "Transactions", level: 1 });
  await goHome();
  const debts = within(await screen.findByRole("region", { name: "Debts" }));
  await user.click(await debts.findByRole("link", { name: new RegExp(counterparty) }));
  await screen.findByRole("heading", { name: counterparty, level: 1 });
}

async function addCounterparty(name: string) {
  await openNewCounterparty();
  await user.type(screen.getByLabelText("Name"), name);
  await user.click(screen.getByRole("button", { name: "Add counterparty" }));
  await screen.findByRole("heading", { name, level: 1 });
}

async function openNewCounterparty() {
  await goHome();
  const debts = within(await screen.findByRole("region", { name: "Debts" }));
  await user.click(debts.getByRole("link", { name: "Add a counterparty" }));
  await screen.findByRole("heading", { name: "New counterparty", level: 1 });
}

const nameHint = "A person, a company, anyone you lend money to or borrow it from.";
