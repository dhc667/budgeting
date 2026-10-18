import type { Color } from "../colors/colors";
import { keyOfId, type RowOf, type Rows } from "../sync/copy";
import { ledgerAccountsBySpace, postingsByLedgerAccount } from "../sync/lookups";

type ReportRows = Pick<Rows, "ledger_accounts" | "postings" | "transactions">;

// What each category took in or paid out on a day, in one currency. Opening balances aren't in it,
// as their category is neither kind.
export type CategoryFlow = {
  day: string;
  currency: string;
  kind: "expense" | "income";
  // Always top-level; a subcategory's flow names its parent here and itself as the subcategory.
  category: FlowCategory;
  subcategory: FlowCategory | null;
  // Net of refunds. Positive for spending on an expense category and for money earned on an
  // income one, whichever way the postings run.
  net: number;
};

export type FlowCategory = {
  id: string;
  name: string;
  icon: string;
  color: Color;
  spaceId: string;
};

// Every account's change on a day, archived accounts included.
export type AccountMovement = {
  accountId: string;
  currency: string;
  day: string;
  amount: number;
};

export function readCategoryFlows(rows: ReportRows, spaceIds: readonly string[]): CategoryFlow[] {
  const postingsOn = postingsByLedgerAccount(rows.postings);
  const flows = new Map<string, CategoryFlow>();

  for (const ledger of ledgersIn(rows, spaceIds)) {
    const kind = flowKind(ledger.kind);
    const categories = categoriesOf(ledger, rows.ledger_accounts);
    if (kind === null || categories === null) continue;
    for (const posting of postingsOn.get(ledger.id) ?? []) {
      const transaction = rows.transactions.get(keyOfId(posting.transaction_id));
      if (!transaction) continue;
      const key = JSON.stringify([transaction.date, posting.currency, ledger.id]);
      const flow = flows.get(key) ?? {
        day: transaction.date,
        currency: posting.currency,
        kind,
        ...categories,
        net: 0,
      };
      flow.net += kind === "expense" ? posting.amount : -posting.amount;
      flows.set(key, flow);
    }
  }
  return [...flows.values()];
}

export function readAccountMovements(
  rows: ReportRows,
  spaceIds: readonly string[],
): AccountMovement[] {
  const postingsOn = postingsByLedgerAccount(rows.postings);
  const movements = new Map<string, AccountMovement>();

  for (const ledger of ledgersIn(rows, spaceIds)) {
    if (ledger.kind !== "account" || ledger.currency === null) continue;
    for (const posting of postingsOn.get(ledger.id) ?? []) {
      const transaction = rows.transactions.get(keyOfId(posting.transaction_id));
      if (!transaction) continue;
      const key = JSON.stringify([ledger.id, transaction.date]);
      const movement = movements.get(key) ?? {
        accountId: ledger.id,
        currency: ledger.currency,
        day: transaction.date,
        amount: 0,
      };
      movement.amount += posting.amount;
      movements.set(key, movement);
    }
  }
  return [...movements.values()];
}

function ledgersIn(
  { ledger_accounts }: Pick<Rows, "ledger_accounts">,
  spaceIds: readonly string[],
): RowOf<"ledger_accounts">[] {
  const bySpace = ledgerAccountsBySpace(ledger_accounts);
  return spaceIds.flatMap((spaceId) => bySpace.get(spaceId) ?? []);
}

function categoriesOf(
  ledger: RowOf<"ledger_accounts">,
  ledgers: Rows["ledger_accounts"],
): Pick<CategoryFlow, "category" | "subcategory"> | null {
  if (ledger.parent_id === null) {
    const category = flowCategory(ledger);
    return category && { category, subcategory: null };
  }
  const parent = ledgers.get(keyOfId(ledger.parent_id));
  const category = parent ? flowCategory(parent) : null;
  const subcategory = flowCategory(ledger);
  return category && subcategory && { category, subcategory };
}

function flowCategory({
  id,
  name,
  icon,
  color,
  space_id,
}: RowOf<"ledger_accounts">): FlowCategory | null {
  if (name === null || icon === null || color === null) return null;
  return { id, name, icon, color, spaceId: space_id };
}

function flowKind(kind: RowOf<"ledger_accounts">["kind"]): CategoryFlow["kind"] | null {
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
