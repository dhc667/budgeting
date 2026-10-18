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
  const leaves = type === "expense" || type === "transfer";
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
  };
}

// A draft may still hold what another type used; only what its own type uses is saved.
function draftArgs(draft: TransactionDraft) {
  const isTransfer = draft.type === "transfer";
  return {
    transaction_type: draft.type,
    transaction_date: draft.date,
    title: draft.title,
    note: draft.note,
    account: draft.accountId,
    amount: draft.amount,
    category: isTransfer ? null : draft.categoryId,
    to_account: isTransfer ? draft.toAccountId : null,
    to_amount: isTransfer ? draft.toAmount : null,
  };
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
>;

type Category = Pick<Database["public"]["Views"]["categories"]["Row"], "id" | "kind">;

export type TransactionType = Database["public"]["Enums"]["transaction_type"];

// Amounts in minor units of the account they leave or reach, always above zero.
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
};
