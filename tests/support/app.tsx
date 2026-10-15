import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { App } from "../../src/App";
import { defined, existingUser, password, signInLink } from "./local-instance";

export const user = userEvent.setup();

export function openApp(url: string) {
  window.location.hash = new URL(url).hash;
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

export async function openSignedIn(name: string) {
  const { email } = await existingUser(name);
  openApp(signInLink());
  await signIn(email, password);
  await screen.findByRole("heading", { name: new RegExp(`, ${name}$`) });
  return { email };
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
  await openSpaces();
  const form = within(await screen.findByRole("region", { name: "New shared space" }));
  await user.type(form.getByLabelText("Name"), name);
  for (const member of memberNames) await user.click(await form.findByLabelText(member));
  await user.click(form.getByRole("button", { name: "Create space" }));
  await screen.findByRole("heading", { name, level: 1 });
}

// Users pile up across test runs, and the member checklist finds them by name.
export function uniqueName(name: string): string {
  return `${name} ${crypto.randomUUID().slice(0, 8)}`;
}
