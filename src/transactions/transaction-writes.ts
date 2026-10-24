// Shared with the app CLI, which runs under Node's type stripping: import only with extensions.
import type { AppSupabase } from "../supabase/client.ts";
import type { Database } from "../supabase/database.ts";

export async function addTransaction(supabase: AppSupabase, id: string, draft: TransactionDraft) {
  const { error } = await supabase.rpc("add_transaction", {
    transaction_id: id,
    ...draftArgs(draft),
  });
  if (error) throw error;
}

export async function updateTransaction(
  supabase: AppSupabase,
  transactionId: string,
  draft: TransactionDraft,
) {
  const { error } = await supabase.rpc("update_transaction", {
    transaction_id: transactionId,
    ...draftArgs(draft),
  });
  if (error) throw error;
}

export async function deleteTransaction(supabase: AppSupabase, transactionId: string) {
  const { error } = await supabase.rpc("delete_transaction", { transaction_id: transactionId });
  if (error) throw error;
}

export async function restoreTransaction(supabase: AppSupabase, transactionId: string) {
  const { error } = await supabase.rpc("restore_transaction", { transaction_id: transactionId });
  if (error) throw error;
}

// A transaction's postings have one of the shapes `transaction_type` names, unless a category
// changed kind since: money leaving into an income category then edits as income.
export function draftOf(transaction: DraftSource, categories: Category[]): TransactionDraft {
  const type = transaction.type ?? typeFromCategory(transaction, categories);
  const leaves = leavesAccount(type);
  const accountCurrency = leaves ? transaction.from_currency : transaction.to_currency;
  const debtExchanged =
    transaction.debt_currency !== null && transaction.debt_currency !== accountCurrency;
  return {
    type,
    date: transaction.date,
    title: transaction.title ?? "",
    note: transaction.note ?? "",
    accountId: (leaves ? transaction.from_account_id : transaction.to_account_id) ?? "",
    amount: (leaves ? transaction.from_amount : transaction.to_amount) ?? 0,
    categoryId: transaction.category_id,
    toAccountId: type === "transfer" ? transaction.to_account_id : null,
    toAmount: type === "transfer" ? transaction.to_amount : null,
    counterpartyId: transaction.counterparty_id,
    debtCurrency: debtExchanged ? transaction.debt_currency : null,
    debtAmount: debtExchanged ? transaction.debt_amount : null,
  };
}

// A draft may still hold what another type used; only what its own type uses is saved.
function draftArgs(draft: TransactionDraft) {
  const otherSide = otherSideOf(draft.type);
  return {
    transaction_type: draft.type,
    transaction_date: draft.date,
    title: draft.title,
    note: draft.note,
    account: draft.accountId,
    amount: draft.amount,
    category: otherSide === "category" ? draft.categoryId : null,
    to_account: otherSide === "toAccount" ? draft.toAccountId : null,
    to_amount: toAmountOf(draft),
    counterparty: otherSide === "counterparty" ? draft.counterpartyId : null,
    debt_currency: otherSide === "counterparty" ? draft.debtCurrency : null,
  };
}

// The amount reaching the other account of a transfer, or what money given or received in another
// currency changed in the debt.
function toAmountOf(draft: TransactionDraft): number | null {
  switch (otherSideOf(draft.type)) {
    case "toAccount":
      return draft.toAmount;
    case "counterparty":
      return draft.debtCurrency === null ? null : draft.debtAmount;
    case "category":
      return null;
  }
}

// Where the money comes from or goes to, besides the account the draft names. A forgiven debt also
// goes to a built-in category, which the instance picks.
export function otherSideOf(type: TransactionType): "category" | "toAccount" | "counterparty" {
  switch (type) {
    case "expense":
    case "refund":
    case "income":
      return "category";
    case "transfer":
      return "toAccount";
    case "given":
    case "received":
    case "forgave":
    case "forgiven":
      return "counterparty";
  }
}

// A forgiven debt both reaches and leaves its account, by the same amount.
function leavesAccount(type: TransactionType): boolean {
  switch (type) {
    case "expense":
    case "transfer":
    case "given":
    case "forgave":
      return true;
    case "refund":
    case "income":
    case "received":
    case "forgiven":
      return false;
  }
}

function typeFromCategory(transaction: DraftSource, categories: Category[]): TransactionType {
  const category = categories.find(({ id }) => id === transaction.category_id);
  switch (category?.kind) {
    case "income":
      return "income";
    case "expense":
      return transaction.to_account_id === null ? "expense" : "refund";
    case undefined:
      return "transfer";
  }
}

type DraftSource = Pick<
  Database["public"]["Views"]["transaction_details"]["Row"],
  | "type"
  | "date"
  | "title"
  | "note"
  | "from_account_id"
  | "from_amount"
  | "to_account_id"
  | "to_amount"
  | "category_id"
  | "counterparty_id"
  | "debt_amount"
  | "debt_currency"
  | "from_currency"
  | "to_currency"
>;

type Category = Pick<Database["public"]["Views"]["categories"]["Row"], "id" | "kind">;

export type TransactionType = Database["public"]["Enums"]["transaction_type"];

// Amounts in minor units of the account they leave or reach, always above zero. A debt in another
// currency than the account's has its own amount, in minor units of that currency.
export type TransactionDraft = {
  type: TransactionType;
  date: string;
  title: string;
  note: string;
  accountId: string;
  amount: number;
  categoryId: string | null;
  toAccountId: string | null;
  toAmount: number | null;
  counterpartyId: string | null;
  debtCurrency: string | null;
  debtAmount: number | null;
};
