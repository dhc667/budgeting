import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { App } from "../../src/App";
import { existingUser, password, signInLink } from "./local-instance";

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
