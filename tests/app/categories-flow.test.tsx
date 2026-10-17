// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import i18n from "i18next";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAccount,
  createSharedSpace,
  openApp,
  openSignedIn,
  openSpaces,
  recordTransaction,
  uniqueName,
  user,
} from "../support/app";
import {
  anonClient,
  defined,
  inviteLink,
  password,
  signedInAs,
  sql,
  uniqueEmail,
} from "../support/local-instance";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
afterEach(async () => {
  vi.restoreAllMocks();
  await i18n.changeLanguage("en");
});
afterAll(() => sql.end());

describe("categories", () => {
  it("start a new space with expense and income categories", async () => {
    await openSignedIn(uniqueName("Ana"));

    await openSpace("Private");

    const categories = within(await screen.findByRole("region", { name: "Categories" }));
    expect(await categories.findByRole("heading", { name: "Expenses" })).toBeTruthy();
    expect(categories.getByRole("heading", { name: "Income" })).toBeTruthy();
    expect(categories.getByRole("link", { name: "Groceries" })).toBeTruthy();
    expect(categories.getByRole("link", { name: "Salary" })).toBeTruthy();
  });

  it("start a new space in the language the app is showing", async () => {
    const family = uniqueName("Familia");
    await openSignedIn(uniqueName("Ana"));
    await user.click(defined((await screen.findAllByRole("link", { name: "Profile" }))[0]));
    const formats = within(await screen.findByRole("region", { name: "Language and formats" }));
    await user.selectOptions(formats.getByLabelText("Language"), "Español");
    await user.click(formats.getByRole("button", { name: "Save" }));

    await user.click(await screen.findByRole("link", { name: "Administrar espacios" }));
    await user.click(await screen.findByRole("link", { name: "Nuevo espacio" }));
    const form = within(await screen.findByRole("region", { name: "Detalles" }));
    await user.type(form.getByLabelText("Nombre"), family);
    await user.click(form.getByRole("button", { name: "Crear espacio" }));

    const categories = within(await screen.findByRole("region", { name: "Categorías" }));
    expect(await categories.findByRole("link", { name: "Supermercado" })).toBeTruthy();
  });

  it("start a new user's private space in their device's language", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["es-MX"]);
    // The app read the device's language when it loaded, before the stub.
    await i18n.changeLanguage("es-419");
    openApp(await inviteLink());

    await user.type(await screen.findByLabelText("Tu nombre"), "Ana");
    await user.type(screen.getByLabelText("Correo electrónico"), uniqueEmail());
    await user.type(screen.getByLabelText("Contraseña"), password);
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await user.click(defined((await screen.findAllByRole("link", { name: "Perfil" }))[0]));
    await user.click(await screen.findByRole("link", { name: "Administrar espacios" }));
    await user.click(await screen.findByRole("link", { name: /^Privado/ }));

    const categories = within(await screen.findByRole("region", { name: "Categorías" }));
    expect(await categories.findByRole("link", { name: "Supermercado" })).toBeTruthy();
  });

  it("adds a subcategory, listed under its parent, which then can't be deleted", async () => {
    await openSignedIn(uniqueName("Ana"));
    await openSpace("Private");

    await user.click(await screen.findByRole("link", { name: "Add category" }));
    await user.type(await screen.findByLabelText("Name"), "Bakery");
    await user.selectOptions(screen.getByLabelText("Parent category"), "Groceries");
    await user.click(screen.getByLabelText("Apple"));
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await screen.findByRole("heading", { name: "Bakery", level: 1 });

    await user.click(screen.getByRole("link", { name: "Back to Private" }));
    const categories = within(await screen.findByRole("region", { name: "Categories" }));
    const names = (await categories.findAllByRole("link")).map(({ textContent }) => textContent);
    expect(names.indexOf("Bakery")).toBe(names.indexOf("Groceries") + 1);
    await user.click(categories.getByRole("link", { name: "Groceries" }));
    const deleteCard = within(await screen.findByRole("region", { name: "Delete category" }));
    expect(deleteCard.getByText(/has subcategories, so it can't be deleted/)).toBeTruthy();
    expect(deleteCard.queryByRole("button")).toBeNull();
  });

  it("goes back to its space from a new category without adding it", async () => {
    await openSignedIn(uniqueName("Ana"));
    await openSpace("Private");

    await user.click(await screen.findByRole("link", { name: "Add category" }));
    await user.type(await screen.findByLabelText("Name"), "Bakery");
    await user.click(screen.getByRole("link", { name: "Back to Private" }));

    const categories = within(await screen.findByRole("region", { name: "Categories" }));
    await categories.findByRole("link", { name: "Groceries" });
    expect(categories.queryByRole("link", { name: "Bakery" })).toBeNull();
  });

  it("edits a category and shows the change in its history", async () => {
    const ana = uniqueName("Ana");
    await openSignedIn(ana);
    await openCategory("Private", "Groceries");

    const details = within(screen.getByRole("region", { name: "Details" }));
    await user.clear(details.getByLabelText("Name"));
    await user.type(details.getByLabelText("Name"), "Supermarket");
    await user.click(details.getByRole("button", { name: "Save" }));

    expect(await details.findByText("Saved.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Supermarket", level: 1 })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "History", level: 1 })).toBeTruthy();
    expect(
      await screen.findByText(`${ana} renamed the category “Groceries” to “Supermarket”`),
    ).toBeTruthy();
  });

  it("lists a category's transactions, its subcategories' too, on a screen of their own", async () => {
    const family = uniqueName("Family");
    const signedIn = await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);
    const client = await signedInAs(signedIn.email);
    await addSubcategory(client, await categoryIn(client, family, "Groceries"), "Cakes");
    reopenAt("/");
    await addAccount({ name: "Checking", space: family, openingBalance: "" });
    await recordTransaction({ amount: "5", category: "Groceries › Cakes", title: "Birthday" });
    await recordTransaction({ amount: "7", category: "Gifts", title: "Present" });
    await openCategory(family, "Groceries");
    expect(screen.queryByRole("link", { name: /Birthday/ })).toBeNull();

    const category = within(screen.getByRole("navigation", { name: "Groceries" }));
    await user.click(category.getByRole("link", { name: "Transactions" }));

    expect(await screen.findByRole("heading", { name: "Transactions", level: 1 })).toBeTruthy();
    expect(await screen.findByRole("link", { name: /Birthday/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Present/ })).toBeNull();
    await user.click(screen.getByRole("link", { name: "Back to Groceries" }));
    expect(await screen.findByRole("heading", { name: "Groceries", level: 1 })).toBeTruthy();
  });

  it("deletes a category without transactions once confirmed", async () => {
    await openSignedIn(uniqueName("Ana"));
    await openCategory("Private", "Travel");

    await user.click(screen.getByRole("button", { name: "Delete category" }));
    const dialog = within(screen.getByRole("dialog", { name: "Delete Travel?" }));
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    const categories = within(await screen.findByRole("region", { name: "Categories" }));
    await categories.findByRole("link", { name: "Groceries" });
    expect(categories.queryByRole("link", { name: "Travel" })).toBeNull();
  });

  it("moves a deleted category's transactions to the category chosen", async () => {
    const ana = uniqueName("Ana");
    const family = uniqueName("Family");
    await openSignedIn(ana);
    await createSharedSpace(family, []);
    await recordInto(family, "Eating out");
    await openCategory(family, "Eating out");

    await user.click(await screen.findByRole("button", { name: "Delete category" }));
    const dialog = within(screen.getByRole("dialog", { name: "Delete Eating out?" }));
    expect(dialog.getByText("Eating out has 1 transaction. Choose where it goes.")).toBeTruthy();
    const confirm = dialog.getByRole("button", { name: "Delete" });
    expect(confirm).toHaveProperty("disabled", true);
    await user.selectOptions(dialog.getByLabelText("Move to"), "Groceries");
    await user.click(confirm);

    const moved = `${ana} deleted the category “Eating out” and moved its transaction to “Groceries”`;
    await user.click(await screen.findByRole("link", { name: "Activity" }));
    expect(await screen.findByText(moved)).toBeTruthy();
    await user.click(screen.getByRole("link", { name: `Back to ${family}` }));
    await user.click(await screen.findByRole("link", { name: "Groceries" }));
    await user.click(await screen.findByRole("link", { name: "History" }));
    expect(await screen.findByText(moved)).toBeTruthy();
  });

  it("offers a subcategory's parent for its transactions, until it has none", async () => {
    const family = uniqueName("Family");
    const signedIn = await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);
    const client = await signedInAs(signedIn.email);
    const groceries = await categoryIn(client, family, "Groceries");
    await addSubcategory(client, groceries, "Bakery");
    await addSubcategory(client, groceries, "Cakes");
    reopenAt("/");
    await recordInto(family, "Groceries › Cakes");
    await openCategory(family, "Cakes");

    await user.click(await screen.findByRole("button", { name: "Delete category" }));
    const dialog = within(screen.getByRole("dialog", { name: "Delete Cakes?" }));
    expect(dialog.getByRole("option", { name: "Groceries", selected: true })).toBeTruthy();
    expect(dialog.getByRole("option", { name: "Groceries › Bakery" })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Delete" })).toHaveProperty("disabled", false);
    await user.click(dialog.getByRole("button", { name: "Cancel" }));

    const details = within(screen.getByRole("region", { name: "Details" }));
    await user.selectOptions(details.getByLabelText("Parent category"), "None (top level)");
    await user.click(details.getByRole("button", { name: "Save" }));
    await details.findByText("Saved.");
    await user.click(screen.getByRole("button", { name: "Delete category" }));

    const reopened = within(screen.getByRole("dialog", { name: "Delete Cakes?" }));
    expect(
      reopened.getByRole("option", { name: "Choose a category", selected: true }),
    ).toBeTruthy();
    expect(reopened.getByRole("button", { name: "Delete" })).toHaveProperty("disabled", true);
  });

  it("won't delete a category whose transactions have nowhere to go", async () => {
    const family = uniqueName("Family");
    const signedIn = await openSignedIn(uniqueName("Ana"));
    await createSharedSpace(family, []);
    await recordInto(family, "Salary", "Income");
    const client = await signedInAs(signedIn.email);
    for (const other of ["Gifts", "Interest & investments", "Other"]) {
      const { error } = await client.rpc("delete_category", {
        category_id: (await categoryIn(client, family, other, "income")).id,
        move_to: null,
      });
      if (error) throw error;
    }
    reopenAt("/");
    await openCategory(family, "Salary");

    await user.click(await screen.findByRole("button", { name: "Delete category" }));

    const dialog = within(screen.getByRole("dialog", { name: "Delete Salary?" }));
    expect(dialog.getByText(/no other category of its type in this space/)).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Delete" })).toHaveProperty("disabled", true);
  });
});

async function openSpace(name: string) {
  await openSpaces();
  await user.click(await screen.findByRole("link", { name: new RegExp(`^${name}`) }));
  await screen.findByRole("heading", { name, level: 1 });
}

async function openCategory(space: string, name: string) {
  await openSpace(space);
  const categories = within(await screen.findByRole("region", { name: "Categories" }));
  await user.click(await categories.findByRole("link", { name }));
  await screen.findByRole("heading", { name, level: 1 });
}

// A fresh app, so it fetches what was written behind its back.
function reopenAt(path: string) {
  cleanup();
  openApp(`http://localhost:3000/#${path}`);
}

// Into a new account in the space, through the app's own form.
async function recordInto(spaceName: string, category: string, type?: "Income") {
  await addAccount({ name: "Checking", space: spaceName, openingBalance: "" });
  await recordTransaction({ type, amount: "5", account: "Checking", category });
}

// The kind tells apart starter categories that share a name, like the two "Gifts".
async function categoryIn(
  client: Client,
  spaceName: string,
  categoryName: string,
  kind?: "expense" | "income",
) {
  const { data: space, error: spaceError } = await client
    .from("spaces")
    .select("id")
    .eq("name", spaceName)
    .single();
  if (spaceError) throw spaceError;
  let query = client
    .from("categories")
    .select("id, space_id")
    .eq("space_id", space.id)
    .eq("name", categoryName);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

async function addSubcategory(client: Client, parent: Category, name: string) {
  const { error } = await client.rpc("create_category", {
    space: parent.space_id,
    category_name: name,
    category_kind: "expense",
    category_icon: "tag",
    category_color: "blue",
    parent: parent.id,
  });
  if (error) throw error;
}

type Client = ReturnType<typeof anonClient>;

type Category = Awaited<ReturnType<typeof categoryIn>>;
