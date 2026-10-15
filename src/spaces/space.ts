import type { TFunction } from "i18next";
import { isCheckViolation } from "../supabase/errors";
import type { Space } from "./space-queries";

export function isPrivate(space: Pick<Space, "private_owner">): boolean {
  return space.private_owner !== null;
}

export function spaceName(space: Pick<Space, "name">, t: TFunction): string {
  return space.name ?? t("spaces.private");
}

export function nameErrorMessage(error: Error, t: TFunction): string {
  if (isCheckViolation(error)) return t("spaces.errors.nameBlank");
  return t("spaces.errors.saveFailed");
}
