import { newestFirst } from "../spaces/read-spaces";
import type { Json } from "../supabase/database.types";
import type { RowOf, Rows } from "../sync/copy";
import type { Category, CategoryKind } from "./category-queries";

export function readCategories({
  ledger_accounts,
  postings,
}: Pick<Rows, "ledger_accounts" | "postings">): Category[] {
  const transactionsOf = new Map<string, Set<string>>();
  for (const { ledger_account_id, transaction_id } of postings.values()) {
    const transactions = transactionsOf.get(ledger_account_id) ?? new Set<string>();
    transactionsOf.set(ledger_account_id, transactions.add(transaction_id));
  }

  return [...ledger_accounts.values()].flatMap((ledgerAccount) => {
    const { id, space_id, parent_id, name, icon, color, created_at } = ledgerAccount;
    const kind = categoryKind(ledgerAccount.kind);
    if (kind === null || name === null || icon === null || color === null) return [];
    return [
      {
        id,
        space_id,
        kind,
        parent_id,
        name,
        icon,
        color,
        created_at,
        transaction_count: transactionsOf.get(id)?.size ?? 0,
      },
    ];
  });
}

// The category's own changes, including deletes of other categories that moved their transactions
// into this one.
export function readCategoryHistory({ activity }: Pick<Rows, "activity">, categoryId: string) {
  return newestFirst(
    activity,
    (entry) =>
      entry.table_name === "ledger_accounts" &&
      (entry.row_id === categoryId || movedTo(entry.old) === categoryId),
  );
}

function categoryKind(kind: RowOf<"ledger_accounts">["kind"]): CategoryKind | null {
  switch (kind) {
    case "expense":
    case "income":
      return kind;
    case "account":
    case "opening_balance":
      return null;
  }
}

function movedTo(snapshot: Json | null): Json | undefined {
  const moved = member(snapshot, "moved_to");
  return member(moved, "id");
}

function member(value: Json | null | undefined, key: string): Json | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value[key];
}
