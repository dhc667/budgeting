import { type Location, useLocation, useSearchParams } from "react-router";
import type { Account } from "../accounts/account-queries";
import { withSubcategories } from "../categories/category";
import type { Category } from "../categories/category-queries";
import type { Space } from "../spaces/space-queries";
import type { TransactionFilter } from "./transaction-queries";

// Kept in the address, so that opening a transaction and coming back finds the list as it was.
export function useListFilters() {
  const [params, setParams] = useSearchParams();
  const value = (name: keyof ListFilters) => params.get(name) ?? "";
  const values: ListFilters = {
    search: value("search"),
    space: value("space"),
    account: value("account"),
    category: value("category"),
    from: value("from"),
    to: value("to"),
  };
  const change = (changes: Partial<ListFilters>) =>
    setParams(
      (next) => {
        for (const [name, value] of Object.entries(changes)) {
          if (value) next.set(name, value);
          else next.delete(name);
        }
        return next;
      },
      { replace: true },
    );
  const clear = () => change(Object.fromEntries(narrowingNames.map((name) => [name, ""])));
  return { values, change, clear };
}

// A transaction opened from the list leads back to it as it was, and to the whole list otherwise.
export function useListAddress(): string {
  const state: unknown = useLocation().state;
  return `/transactions${isOpenedFromList(state) ? state.listSearch : ""}`;
}

export function openedFrom({ pathname, search }: Location): OpenedFromList | null {
  return pathname === "/transactions" ? { listSearch: search } : null;
}

// A space, account or category the picker or the chosen space leaves out narrows nothing.
export function inPlay(
  values: ListFilters,
  { shownSpaces, accounts, categories }: Choices,
): { spaces: Space[]; accounts: Account[]; categories: Category[] } {
  const chosenSpace = shownSpaces.find(({ id }) => id === values.space);
  const spaces = chosenSpace ? [chosenSpace] : shownSpaces;
  const inSpaces = ({ space_id }: { space_id: string }) => spaces.some(({ id }) => id === space_id);
  return { spaces, accounts: accounts.filter(inSpaces), categories: categories.filter(inSpaces) };
}

export function transactionFilter(
  values: ListFilters,
  choices: Choices,
  search: string,
): TransactionFilter {
  const { spaces, accounts, categories } = inPlay(values, choices);
  const account = accounts.find(({ id }) => id === values.account);
  const category = categories.find(({ id }) => id === values.category);
  return {
    spaceIds: spaces.map(({ id }) => id),
    accountId: account?.id,
    categoryIds: category && withSubcategories(category, categories).map(({ id }) => id),
    from: values.from || undefined,
    to: values.to || undefined,
    search,
  };
}

export function activeCount(values: ListFilters): number {
  return narrowingNames.filter((name) => values[name]).length;
}

// The search shows on its own, so it isn't counted or cleared with the rest.
const narrowingNames = ["space", "account", "category", "from", "to"] as const;

function isOpenedFromList(state: unknown): state is OpenedFromList {
  return (
    typeof state === "object" &&
    state !== null &&
    "listSearch" in state &&
    typeof state.listSearch === "string"
  );
}

type OpenedFromList = { listSearch: string };

export type ListFilters = Record<"search" | (typeof narrowingNames)[number], string>;

type Choices = { shownSpaces: Space[]; accounts: Account[]; categories: Category[] };
