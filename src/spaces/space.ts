import type { TFunction } from "i18next";
import { resources } from "../i18n/resources";
import { findNamed, sameName } from "../names";
import { isUniqueViolation, violatedConstraint } from "../supabase/errors";
import type { Space } from "./space-queries";

export function isPrivate(space: Pick<Space, "private_owner">): boolean {
  return space.private_owner !== null;
}

export function spaceName(space: Pick<Space, "name">, t: TFunction): string {
  return space.name ?? t("spaces.private");
}

export function inSpaces<Item extends { space_id: string }>(
  items: readonly Item[],
  spaces: readonly Pick<Space, "id">[],
): Item[] {
  return items.filter(({ space_id }) => spaces.some(({ id }) => id === space_id));
}

// No shared space takes what a private space is called in any of the app's languages.
export const privateSpaceNames = Object.values(resources).map(
  ({ translation }) => translation.spaces.private,
);

// Shared spaces the user isn't in are missing from the local copy: a clash with one comes back as
// the instance refusing the save.
export function nameClashMessage(
  name: string,
  { spaces, spaceId, refused }: { spaces: Space[]; spaceId?: string; refused: boolean },
  t: TFunction,
): string | undefined {
  const reserved = privateSpaceNames.find((privateName) => sameName(privateName, name));
  if (reserved) return t("spaces.errors.nameReserved", { name: reserved });
  const named = spaces.flatMap(({ id, name }) =>
    name !== null && id !== spaceId ? [{ name }] : [],
  );
  const clash = findNamed(named, name);
  if (clash || refused) return t("spaces.errors.nameTaken", { name: clash?.name ?? name });
  return undefined;
}

// A name clash shows on the name field, not here.
export function nameErrorMessage(error: Error, t: TFunction): string | undefined {
  if (isUniqueViolation(error)) return undefined;
  if (violatedConstraint(error) === "name_not_blank") return t("spaces.errors.nameBlank");
  return t("spaces.errors.saveFailed");
}
