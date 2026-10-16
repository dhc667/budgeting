import type { TFunction } from "i18next";
import type { Category } from "../categories/category-queries";
import type { User } from "../profile/profile-queries";
import { Constants, type Json } from "../supabase/database.types";
import type { Activity } from "./space-queries";

export function hasChanged(entry: Activity, key: string): boolean {
  return JSON.stringify(valueAt(entry.old, key)) !== JSON.stringify(valueAt(entry.new, key));
}

export function stringAt(row: Json, key: string): string | null {
  const value = valueAt(row, key);
  return typeof value === "string" ? value : null;
}

export function valueAt(row: Json, key: string): Json | undefined {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return undefined;
  return row[key];
}

export const ledgerAccountKinds = Constants.public.Enums.ledger_account_kind;

export type Phrasing = {
  users: User[];
  categories: Category[];
  t: TFunction;
  money: (minorUnits: number, currency: string) => string;
  day: (day: string) => string;
};
