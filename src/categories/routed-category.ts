import { useParams } from "react-router";
import { type Category, useCategories } from "./category-queries";

// Undefined while the categories load, null when the route names none of them.
export function useRoutedCategory(): Category | null | undefined {
  const { categoryId } = useParams();
  const { data: categories } = useCategories();
  if (!categories) return undefined;
  return categories.find(({ id }) => id === categoryId) ?? null;
}
