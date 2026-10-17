import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { App } from "../../src/App";
import { defined, existingUser, password, signInLink } from "./local-instance";

export const user = userEvent.setup();

// jsdom has no modal dialogs. Opening and closing are all the app asks of them.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.open = false;
};

export function openApp(url: string) {
  window.location.hash = new URL(url).hash;
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

export async function openSignedIn(name: string) {
  const signedIn = await existingUser(name);
  openApp(signInLink());
  await signIn(signedIn.email, password);
  await screen.findByRole("heading", { name: new RegExp(`, ${name}$`) });
  return signedIn;
}

export async function signIn(email: string, withPassword: string) {
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), withPassword);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

export async function openSpaces() {
  await user.click(defined((await screen.findAllByRole("link", { name: "Profile" }))[0]));
  await user.click(await screen.findByRole("link", { name: "Manage spaces" }));
}

export async function createSharedSpace(name: string, memberNames: string[]) {
  await openNewSpace();
  const form = within(await screen.findByRole("region", { name: "Details" }));
  await user.type(form.getByLabelText("Name"), name);
  for (const member of memberNames) await user.click(await form.findByLabelText(member));
  await user.click(form.getByRole("button", { name: "Create space" }));
  await screen.findByRole("heading", { name, level: 1 });
}

export async function openNewSpace() {
  await openSpaces();
  await user.click(await screen.findByRole("link", { name: "New space" }));
  await screen.findByRole("heading", { name: "New shared space", level: 1 });
}

type NewAccount = { name: string; openingBalance: string; space?: string; currency?: string };

export async function addAccount({ name, openingBalance, space, currency }: NewAccount) {
  await openNewAccount();
  if (space) await user.selectOptions(screen.getByLabelText("Space"), space);
  if (currency) await user.selectOptions(screen.getByLabelText("Currency"), currency);
  await user.type(screen.getByLabelText("Name"), name);
  if (openingBalance) await user.type(screen.getByLabelText("Opening balance"), openingBalance);
  await user.click(screen.getByRole("button", { name: "Add account" }));
  await screen.findByRole("heading", { name, level: 1 });
}

export async function openNewAccount() {
  await goHome();
  await user.click(await screen.findByRole("link", { name: "Add account" }));
  await screen.findByRole("heading", { name: "New account" });
}

export async function goHome() {
  await user.click(defined((await screen.findAllByRole("link", { name: "Home" }))[0]));
}

type NewTransaction = {
  type?: "Expense" | "Refund" | "Income" | "Transfer";
  amount: string;
  // The account money leaves, or reaches for an income or refund.
  account?: string;
  category?: string;
  to?: string;
  title?: string;
};

// Through the app's own form, landing on the transactions list.
export async function recordTransaction({
  type,
  amount,
  account,
  category,
  to,
  title,
}: NewTransaction) {
  await openNewTransaction();
  if (title) await user.type(screen.getByLabelText("Title"), title);
  if (type === "Refund") await user.click(screen.getByLabelText(/Refund/));
  else if (type) await user.click(screen.getByRole("tab", { name: type }));
  await user.type(screen.getByLabelText("Amount"), amount);
  if (account) await choose(type === "Transfer" ? "From" : "Account", account);
  if (to) await choose("To", to);
  if (category) await choose("Category", category);
  await user.click(screen.getByRole("button", { name: "Add transaction" }));
  await screen.findByRole("heading", { name: "Transactions", level: 1 });
}

export async function openNewTransaction() {
  await user.click(defined(screen.getAllByRole("link", { name: "Add transaction" })[0]));
  await screen.findByRole("heading", { name: "New transaction" });
}

export async function choose(picker: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: picker }));
  await user.click(screen.getByRole("option", { name: option }));
}

// Users pile up across test runs, and the member checklist finds them by name.
export function uniqueName(name: string): string {
  return `${name} ${crypto.randomUUID().slice(0, 8)}`;
}
