import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { EmptyState } from "../ui/Card";
import { Subscreen } from "../ui/Subscreen";
import type { Category } from "./category-queries";
import { useRoutedCategory } from "./routed-category";

type CategorySubscreenProps = { title: string; children: (category: Category) => ReactNode };

export function CategorySubscreen({ title, children }: CategorySubscreenProps) {
  const category = useRoutedCategory();
  if (category === undefined) return null;
  if (category === null) return <CategoryNotFound />;

  return (
    <Subscreen back={{ to: `/categories/${category.id}`, place: category.name }} title={title}>
      {children(category)}
    </Subscreen>
  );
}

export function CategoryNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <EmptyState>{t("categories.notFound")}</EmptyState>
      <Link to="/spaces" className="font-medium text-emerald-700 dark:text-emerald-400">
        {t("spaces.backToSpaces")}
      </Link>
    </div>
  );
}
