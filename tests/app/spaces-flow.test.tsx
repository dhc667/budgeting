// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSharedSpace as createSpace,
  openApp,
  openSignedIn,
  openSpaces,
  signIn,
  uniqueName,
  user,
} from "../support/app";
import { admin, existingUser, password, signInLink, sql } from "../support/local-instance";

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

  it("creates a shared space with another user, who sees it with its activity", async () => {
    const ana = uniqueName("Ana");
    const benName = uniqueName("Ben");
    const ben = await existingUser(benName);
    await openSignedIn(ana);

    await createSpace("Family", [benName]);
    cleanup();
    localStorage.clear();
    openApp(signInLink());
    await signIn(ben.email, password);
    await openSpaces();
    await user.click(await screen.findByRole("link", { name: /^Family/ }));

    const members = within(await screen.findByRole("region", { name: "Members" }));
    expect(members.getByText(ana)).toBeTruthy();
    const activity = within(screen.getByRole("region", { name: "Activity" }));
    expect(await activity.findByText(`${ana} created the space`)).toBeTruthy();
    expect(activity.getByText(`${ana} added ${benName}`)).toBeTruthy();
  });

  it("refuses a blank name", async () => {
    await openSignedIn(uniqueName("Ana"));
    await openSpaces();

    const form = within(await screen.findByRole("region", { name: "New shared space" }));
    await user.type(form.getByLabelText("Name"), "   ");
    await user.click(form.getByRole("button", { name: "Create space" }));

    expect((await form.findByRole("alert")).textContent).toMatch(/can't be blank/);
  });

  it("names a member whose account was deleted as a deleted user", async () => {
    const ana = uniqueName("Ana");
    const benName = uniqueName("Ben");
    const ben = await existingUser(benName);
    await openSignedIn(ana);
    await createSpace("Family", [benName]);

    await admin.auth.admin.deleteUser(ben.userId);
    cleanup();
    openApp("http://localhost:3000/#/spaces");
    await user.click(await screen.findByRole("link", { name: /^Family/ }));

    const activity = within(await screen.findByRole("region", { name: "Activity" }));
    expect(await activity.findByText(`${ana} added a deleted user`)).toBeTruthy();
    expect(activity.getByText("A member's account was deleted")).toBeTruthy();
  });

  it("renames a space and records it in the activity", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await createSpace("Family", []);

    const nameCard = within(screen.getByRole("region", { name: "Name" }));
    await user.clear(nameCard.getByLabelText("Name"));
    await user.type(nameCard.getByLabelText("Name"), "Home");
    await user.click(nameCard.getByRole("button", { name: "Rename" }));

    expect(await screen.findByRole("heading", { name: "Home", level: 1 })).toBeTruthy();
    const activity = within(screen.getByRole("region", { name: "Activity" }));
    expect(
      await activity.findByText(`${ana} renamed the space from “Family” to “Home”`),
    ).toBeTruthy();
  });

  it("lets a member leave, and the space is gone from their list", async () => {
    const benName = uniqueName("Ben");
    await existingUser(benName);
    await openSignedIn(uniqueName("Ana"));
    await createSpace("Family", [benName]);

    await user.click(screen.getByRole("button", { name: "Leave" }));

    await screen.findByRole("heading", { name: "Spaces" });
    expect(screen.queryByRole("link", { name: /^Family/ })).toBeNull();
  });

  it("doesn't offer leaving to the last member", async () => {
    await openSignedIn(uniqueName("Ana"));

    await createSpace("Family", []);

    expect(screen.queryByRole("button", { name: "Leave" })).toBeNull();
    expect(screen.getByText(/You're the last member/)).toBeTruthy();
  });

  it("deletes a space after confirming", async () => {
    await openSignedIn(uniqueName("Ana"));
    await createSpace("Family", []);

    await user.click(screen.getByRole("button", { name: "Delete space" }));
    await user.click(screen.getByRole("button", { name: "Delete Family" }));

    await screen.findByRole("heading", { name: "Spaces" });
    expect(screen.queryByRole("link", { name: /^Family/ })).toBeNull();
  });
});
