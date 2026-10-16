import type { TFunction } from "i18next";
import type { Category, CategoryKind } from "./category-queries";

export const categoryKinds = ["expense", "income"] as const satisfies CategoryKind[];

export function categoryTree(
  categories: Category[],
): { category: Category; children: Category[] }[] {
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name);
  return categories
    .filter(({ parent_id }) => parent_id === null)
    .sort(byName)
    .map((category) => ({
      category,
      children: categories.filter(({ parent_id }) => parent_id === category.id).sort(byName),
    }));
}

// Names can repeat, so a subcategory is told apart by its parent's name.
export function categoryLabel(category: Category, categories: Category[]): string {
  const parent = categories.find(({ id }) => id === category.parent_id);
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

export function kindName(kind: CategoryKind, t: TFunction): string {
  switch (kind) {
    case "expense":
      return t("categories.kind.expense");
    case "income":
      return t("categories.kind.income");
  }
}
