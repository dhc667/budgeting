import { useTranslation } from "react-i18next";
import { TransactionList } from "../transactions/TransactionList";
import { withSubcategories } from "./category";
import { type Category, useCategories } from "./category-queries";
import { CategorySubscreen } from "./CategorySubscreen";

export function CategoryTransactionsScreen() {
  const { t } = useTranslation();
  return (
    <CategorySubscreen title={t("transactions.title")}>
      {(category) => <CategoryTransactions category={category} />}
    </CategorySubscreen>
  );
}

function CategoryTransactions({ category }: { category: Category }) {
  const { data: categories = [] } = useCategories();
  return (
    <TransactionList
      filter={{
        kind: "categories",
        categoryIds: withSubcategories(category, categories).map(({ id }) => id),
      }}
    />
  );
}
