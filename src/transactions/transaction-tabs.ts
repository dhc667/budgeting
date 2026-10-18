import type { TFunction } from "i18next";
import type { CategoryKind } from "../categories/category-queries";
import type { TransactionType } from "./transaction-writes";

export function tabOf(type: TransactionType): Tab {
  switch (type) {
    case "expense":
    case "refund":
      return "expense";
    case "income":
      return "income";
    case "transfer":
      return "transfer";
    case "given":
    case "received":
    case "forgave":
    case "forgiven":
      return "debt";
  }
}

export function typeOf(
  tab: Tab,
  { refund, debt }: { refund: boolean; debt: DebtType },
): TransactionType {
  switch (tab) {
    case "expense":
      return refund ? "refund" : "expense";
    case "income":
    case "transfer":
      return tab;
    case "debt":
      return debt;
  }
}

export function debtTypeOf(type: TransactionType): DebtType | null {
  switch (type) {
    case "given":
    case "received":
    case "forgave":
    case "forgiven":
      return type;
    case "expense":
    case "refund":
    case "income":
    case "transfer":
      return null;
  }
}

export function isForgiveness(type: TransactionType): boolean {
  return type === "forgave" || type === "forgiven";
}

export function categoryKindOf(tab: Tab): CategoryKind | null {
  switch (tab) {
    case "expense":
      return "expense";
    case "income":
      return "income";
    case "transfer":
    case "debt":
      return null;
  }
}

export function tabName(tab: Tab, t: TFunction): string {
  switch (tab) {
    case "expense":
      return t("transactions.type.expense");
    case "income":
      return t("transactions.type.income");
    case "transfer":
      return t("transactions.type.transfer");
    case "debt":
      return t("transactions.type.debt");
  }
}

export type Tab = "expense" | "income" | "transfer" | "debt";

export type DebtType = Extract<TransactionType, "given" | "received" | "forgave" | "forgiven">;

export const tabs: readonly Tab[] = ["expense", "income", "transfer", "debt"];

export const ruleTabs: readonly Tab[] = ["expense", "income", "transfer"];
