import type { TFunction } from "i18next";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card, EmptyState } from "../ui/Card";
import { categoryKinds, categoryTree } from "./category";
import { type Category, type CategoryKind, useCategories } from "./category-queries";
import { CategoryIcon } from "./CategoryIcon";

export function CategoriesCard({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { data: categories } = useCategories();
  if (!categories) return null;
  const inSpace = categories.filter(({ space_id }) => space_id === spaceId);

  return (
    <Card title={t("categories.title")}>
      {inSpace.length === 0 && <EmptyState>{t("categories.none")}</EmptyState>}
      {categoryKinds.map((kind) => (
        <CategoryGroup
          key={kind}
          kind={kind}
          categories={inSpace.filter((category) => category.kind === kind)}
        />
      ))}
      <Link
        to={`/spaces/${spaceId}/categories/new`}
        className="flex h-11 items-center gap-2 self-start font-medium text-emerald-700 dark:text-emerald-400"
      >
        <Plus className="size-5" />
        {t("categories.add")}
      </Link>
    </Card>
  );
}

function CategoryGroup({ kind, categories }: { kind: CategoryKind; categories: Category[] }) {
  const { t } = useTranslation();
  if (categories.length === 0) return null;
  return (
    <section className="flex flex-col">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {groupHeading(kind, t)}
      </h3>
      <ul className="-mx-2 flex flex-col">
        {categoryTree(categories).map(({ category, children }) => (
          <li key={category.id}>
            <CategoryLink category={category} />
            {children.length > 0 && (
              <ul className="flex flex-col pl-8">
                {children.map((child) => (
                  <li key={child.id}>
                    <CategoryLink category={child} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryLink({ category }: { category: Category }) {
  return (
    <Link
      to={`/categories/${category.id}`}
      className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <CategoryIcon icon={category.icon} color={category.color} />
      <span className="flex-1 truncate">{category.name}</span>
    </Link>
  );
}

function groupHeading(kind: CategoryKind, t: TFunction): string {
  switch (kind) {
    case "expense":
      return t("categories.expenses");
    case "income":
      return t("categories.incomes");
  }
}
