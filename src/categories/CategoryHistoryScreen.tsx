import { useTranslation } from "react-i18next";
import { ActivityList } from "../spaces/ActivityList";
import { useCategoryHistory } from "./category-queries";
import { CategorySubscreen } from "./CategorySubscreen";

export function CategoryHistoryScreen() {
  const { t } = useTranslation();
  return (
    <CategorySubscreen title={t("categories.history")}>
      {(category) => <CategoryHistory categoryId={category.id} />}
    </CategorySubscreen>
  );
}

function CategoryHistory({ categoryId }: { categoryId: string }) {
  const { data: history } = useCategoryHistory(categoryId);
  return <ActivityList activity={history} />;
}
