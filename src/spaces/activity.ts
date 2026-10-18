import type { TFunction } from "i18next";
import type { Category } from "../categories/category-queries";
import type { User } from "../profile/profile-queries";
import { Constants, type Json } from "../supabase/database.types";
import { memberOf } from "../supabase/json";
import type { Activity } from "../activity/activity";

export function hasChanged(entry: Activity, key: string): boolean {
  return JSON.stringify(memberOf(entry.old, key)) !== JSON.stringify(memberOf(entry.new, key));
}

export function stringAt(row: Json, key: string): string | null {
  const value = memberOf(row, key);
  return typeof value === "string" ? value : null;
}

export const ledgerAccountKinds = Constants.public.Enums.ledger_account_kind;

export type Phrasing = {
  users: User[];
  categories: Category[];
  t: TFunction;
  money: (minorUnits: number, currency: string) => string;
  day: (day: string) => string;
};
