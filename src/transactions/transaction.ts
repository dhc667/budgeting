import type { TFunction } from "i18next";
import type { Category } from "../categories/category-queries";
import type { Transaction, TransactionDraft, TransactionType } from "./transaction-queries";

export function transactionLabel(
  transaction: Pick<Transaction, "title" | "category_id">,
  categories: Category[],
  t: TFunction,
): string {
  if (transaction.title !== null) return transaction.title;
  const category = categories.find(({ id }) => id === transaction.category_id);
  return category?.name ?? t("transactions.transfer");
}

// Seen from one account, a transfer leaves or reaches it. Seen whole, it only moves money between
// two, so it has no sign.
export function shownAmount(transaction: Transaction, accountId?: string): ShownAmount {
  const leaving = sideOf(
    transaction.from_account_id,
    transaction.from_amount,
    transaction.from_currency,
  );
  const reaching = sideOf(
    transaction.to_account_id,
    transaction.to_amount,
    transaction.to_currency,
  );
  if (leaving && reaching) {
    if (accountId === reaching.accountId) return { ...reaching, direction: "in" };
    if (accountId === leaving.accountId) return { ...leaving, direction: "out" };
    return { ...leaving, direction: "between" };
  }
  if (reaching) return { ...reaching, direction: "in" };
  if (leaving) return { ...leaving, direction: "out" };
  throw new Error(`Transaction ${transaction.id} shows no account`);
}

// Money leaving shows below zero. A transfer seen whole only moves money, so it shows as moved.
export function signedAmount({ amount, direction }: ShownAmount): number {
  switch (direction) {
    case "in":
    case "between":
      return amount;
    case "out":
      return -amount;
  }
}

// A transaction's postings have one of the shapes `transaction_type` names, unless a category
// changed kind since: money leaving into an income category then edits as income.
export function draftOf(transaction: Transaction, categories: Category[]): TransactionDraft {
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

// The accounts a transaction already uses, which it keeps even once archived.
export function accountsOf(transaction: Transaction): string[] {
  return [transaction.from_account_id, transaction.to_account_id].filter((id) => id !== null);
}

function typeFromCategory(transaction: Transaction, categories: Category[]): TransactionType {
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

function sideOf(accountId: string | null, amount: number | null, currency: string | null) {
  if (accountId === null || amount === null || currency === null) return null;
  return { accountId, amount, currency };
}

export type ShownAmount = {
  accountId: string;
  amount: number;
  currency: string;
  direction: "in" | "out" | "between";
};
