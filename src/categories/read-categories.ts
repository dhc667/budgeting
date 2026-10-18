import { type Activity, newestFirst } from "../activity/activity";
import type { Json } from "../supabase/database.types";
import { memberOf } from "../supabase/json";
import type { RowOf, Rows } from "../sync/copy";
import { postingsByLedgerAccount } from "../sync/lookups";
import type { Category, CategoryKind, BuiltInCategory } from "./category-queries";

// A built-in category has no stored name: it is called whatever `builtInName` says.
export function readCategories(
  { ledger_accounts, postings }: Pick<Rows, "ledger_accounts" | "postings">,
  builtInName: (builtIn: BuiltInCategory) => string,
): Category[] {
  const postingsOf = postingsByLedgerAccount(postings);

  return [...ledger_accounts.values()].flatMap((ledgerAccount) => {
    const { id, space_id, parent_id, icon, color, created_at, built_in } = ledgerAccount;
    const kind = categoryKind(ledgerAccount.kind);
    const name = built_in === null ? ledgerAccount.name : builtInName(built_in);
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
        built_in,
        transaction_count: new Set(
          (postingsOf.get(id) ?? []).map(({ transaction_id }) => transaction_id),
        ).size,
      },
    ];
  });
}

// The category's own changes, including deletes of other categories that moved their transactions
// into this one.
export function readCategoryHistory(
  { activity }: Pick<Rows, "activity">,
  categoryId: string,
): Activity[] {
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
    case "counterparty":
      return null;
  }
}

function movedTo(snapshot: Json | null): Json | undefined {
  return memberOf(memberOf(snapshot, "moved_to"), "id");
}
