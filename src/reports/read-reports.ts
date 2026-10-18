import type { Color } from "../colors/colors";
import { keyOfId, type RowOf, type Rows } from "../sync/copy";
import { ledgerAccountsBySpace, postingsByLedgerAccount } from "../sync/lookups";

type ReportRows = Pick<Rows, "ledger_accounts" | "postings" | "transactions">;

// What each top-level category took in or paid out on a day, in one currency. Subcategories count
// towards their parent. Opening balances aren't in it, as their category is neither kind.
export type CategoryFlow = {
  day: string;
  currency: string;
  kind: "expense" | "income";
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: Color;
  spaceId: string;
  // Net of refunds. Positive for spending on an expense category and for money earned on an
  // income one, whichever way the postings run.
  net: number;
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
    const top = topLevel(ledger, rows.ledger_accounts);
    if (kind === null || top?.name == null || top.icon === null || top.color === null) continue;
    for (const posting of postingsOn.get(ledger.id) ?? []) {
      const transaction = rows.transactions.get(keyOfId(posting.transaction_id));
      if (!transaction) continue;
      const key = JSON.stringify([transaction.date, posting.currency, top.id, kind]);
      const flow = flows.get(key) ?? {
        day: transaction.date,
        currency: posting.currency,
        kind,
        categoryId: top.id,
        categoryName: top.name,
        categoryIcon: top.icon,
        categoryColor: top.color,
        spaceId: top.space_id,
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

function topLevel(
  ledger: RowOf<"ledger_accounts">,
  ledgers: Rows["ledger_accounts"],
): RowOf<"ledger_accounts"> | undefined {
  if (ledger.parent_id === null) return ledger;
  return ledgers.get(keyOfId(ledger.parent_id));
}

function flowKind(kind: RowOf<"ledger_accounts">["kind"]): CategoryFlow["kind"] | null {
  switch (kind) {
    case "expense":
    case "income":
      return kind;
    case "account":
    case "opening_balance":
      return null;
  }
}
