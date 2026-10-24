// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  createSharedSpace,
  openApp,
  openNewSpace,
  openSignedIn,
  openSpaces,
  signIn,
  uniqueName,
  user,
} from "../support/app";
import {
  admin,
  createSpace,
  existingUser,
  password,
  signedInUser,
  signInLink,
  sql,
} from "../support/local-instance";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterAll(() => sql.end());

describe("spaces", () => {
  it("shows the private space, which can't be shared", async () => {
    await openSignedIn(uniqueName("Ana"));

    await openSpaces();
    await user.click(await screen.findByRole("link", { name: /^Private/ }));

    expect(await screen.findByText(/Only you can see this space/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Members" })).toBeNull();
  });

  it("keeps the private space's activity too", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await addAccount({ name: "Wallet", openingBalance: "" });

    await openSpaces();
    await user.click(await screen.findByRole("link", { name: /^Private/ }));

    await user.click(await screen.findByRole("link", { name: "Activity" }));

    expect(await screen.findByRole("heading", { name: "Activity", level: 1 })).toBeTruthy();
    expect(await screen.findByText(new RegExp(`^${ana} added .*Wallet`))).toBeTruthy();
  });

  it("creates a shared space with another user, who sees it with its activity", async () => {
    const family = uniqueName("Family");
    const ana = uniqueName("Ana");
    const benName = uniqueName("Ben");
    const ben = await existingUser(benName);
    await openSignedIn(ana);

    await createSharedSpace(family, [benName]);
    cleanup();
    localStorage.clear();
    openApp(signInLink());
    await signIn(ben.email, password);
    await openSpaces();
    await user.click(await screen.findByRole("link", { name: new RegExp(`^${family}`) }));

    const members = within(await screen.findByRole("region", { name: "Members" }));
    expect(await members.findByText(ana)).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Activity" }));
    expect(await screen.findByText(`${ana} created the space`)).toBeTruthy();
    expect(screen.getByText(`${ana} added ${benName}`)).toBeTruthy();
  });

  it("refuses a blank name", async () => {
    await openSignedIn(uniqueName("Ana"));
    await openNewSpace();

    const form = within(await screen.findByRole("region", { name: "Details" }));
    await user.type(form.getByLabelText("Name"), "   ");
    await user.click(form.getByRole("button", { name: "Create space" }));

    expect((await form.findByRole("alert")).textContent).toMatch(/can't be blank/);
  });

  it("won't take what everyone's private space is called", async () => {
    await openSignedIn(uniqueName("Ana"));
    await openNewSpace();

    const form = within(await screen.findByRole("region", { name: "Details" }));
    await user.type(form.getByLabelText("Name"), "privado");

    expect(
      form.getByRole("textbox", {
        name: "Name",
        description: "Privado is what everyone's private space is called. Pick another name.",
      }),
    ).toBeTruthy();
  });

  it("refuses a name a space the user isn't in already has", async () => {
    const taken = uniqueName("Family");
    await createSpace(await signedInUser("Ben"), taken, []);
    await openSignedIn(uniqueName("Ana"));
    await openNewSpace();

    const form = within(await screen.findByRole("region", { name: "Details" }));
    await user.type(form.getByLabelText("Name"), taken.toUpperCase());
    await user.click(form.getByRole("button", { name: "Create space" }));

    expect(
      await form.findByRole("textbox", {
        name: "Name",
        description: `There's already a space named ${taken.toUpperCase()}.`,
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "New shared space", level: 1 })).toBeTruthy();
  });

  it("names a member whose account was deleted as a deleted user", async () => {
    const family = uniqueName("Family");
    const ana = uniqueName("Ana");
    const benName = uniqueName("Ben");
    const ben = await existingUser(benName);
    await openSignedIn(ana);
    await createSharedSpace(family, [benName]);

    await admin.auth.admin.deleteUser(ben.userId);
    cleanup();
    openApp("http://localhost:3000/#/spaces");
    await user.click(await screen.findByRole("link", { name: new RegExp(`^${family}`) }));

    await user.click(await screen.findByRole("link", { name: "Activity" }));
    expect(await screen.findByText(`${ana} added a deleted user`)).toBeTruthy();
    expect(screen.getByText("A member's account was deleted")).toBeTruthy();
  });

  it("renames a space and records it in the activity", async () => {
    const [family, home] = [uniqueName("Family"), uniqueName("Home")];
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await createSharedSpace(family, []);

    const nameCard = within(screen.getByRole("region", { name: "Name" }));
    await user.clear(nameCard.getByLabelText("Name"));
    await user.type(nameCard.getByLabelText("Name"), home);
    await user.click(nameCard.getByRole("button", { name: "Rename" }));

    expect(await screen.findByRole("heading", { name: home, level: 1 })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Activity" }));
    expect(
      await screen.findByText(`${ana} renamed the space from “${family}” to “${home}”`),
    ).toBeTruthy();
  });

  it("won't rename a space to another's name, or to the private space's", async () => {
    const [family, home] = [uniqueName("Family"), uniqueName("Home")];
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(home, []);
    await createSharedSpace(family, []);

    const nameCard = within(screen.getByRole("region", { name: "Name" }));
    expect(nameCard.getByRole("textbox", { name: "Name", description: "" })).toBeTruthy();
    await user.clear(nameCard.getByLabelText("Name"));
    await user.type(nameCard.getByLabelText("Name"), ` ${home.toLowerCase()}`);
    expect(
      nameCard.getByRole("textbox", {
        name: "Name",
        description: `There's already a space named ${home}.`,
      }),
    ).toBeTruthy();
    await user.click(nameCard.getByRole("button", { name: "Rename" }));
    expect(screen.getByRole("heading", { name: family, level: 1 })).toBeTruthy();

    await user.clear(nameCard.getByLabelText("Name"));
    await user.type(nameCard.getByLabelText("Name"), "PRIVATE");

    expect(
      nameCard.getByRole("textbox", {
        name: "Name",
        description: "Private is what everyone's private space is called. Pick another name.",
      }),
    ).toBeTruthy();
  });

  it("lets a member leave, and the space is gone from their list", async () => {
    const family = uniqueName("Family");
    const benName = uniqueName("Ben");
    await existingUser(benName);
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, [benName]);

    await user.click(screen.getByRole("button", { name: "Leave" }));

    await screen.findByRole("heading", { name: "Spaces" });
    expect(screen.queryByRole("link", { name: new RegExp(`^${family}`) })).toBeNull();
  });

  it("doesn't offer leaving to the last member", async () => {
    const family = uniqueName("Family");
    await openSignedIn(uniqueName("Ana"));

    await createSharedSpace(family, []);

    expect(screen.queryByRole("button", { name: "Leave" })).toBeNull();
    expect(screen.getByText(/You're the last member/)).toBeTruthy();
  });

  it("deletes a space after confirming", async () => {
    const family = uniqueName("Family");
    await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);

    await user.click(screen.getByRole("button", { name: "Delete space" }));
    const dialog = within(screen.getByRole("dialog", { name: `Delete ${family}?` }));
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    await screen.findByRole("heading", { name: "Spaces" });
    expect(screen.queryByRole("link", { name: new RegExp(`^${family}`) })).toBeNull();
  });
});
