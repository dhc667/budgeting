import type { PickerOption } from "../ui/Picker";
import { categoryLabel, categoryTree } from "./category";
import { CategoryIcon } from "./CategoryIcon";
import type { Category } from "./category-queries";

// Each parent followed by its subcategories, indented under it.
export function categoryOptions(categories: Category[]): PickerOption[] {
  const option = (category: Category, indent: boolean): PickerOption => ({
    id: category.id,
    label: categoryLabel(category, categories),
    indent,
    content: (
      <>
        <CategoryIcon icon={category.icon} color={category.color} />
        <span className="flex-1 truncate">{category.name}</span>
      </>
    ),
  });
  return categoryTree(categories).flatMap(({ category, children }) => [
    option(category, false),
    ...children.map((child) => option(child, true)),
  ]);
}
