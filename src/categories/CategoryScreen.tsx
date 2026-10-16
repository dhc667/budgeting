import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { afterSuccess } from "../query-client";
import { ActivityList } from "../spaces/ActivityList";
import { spaceName } from "../spaces/space";
import { useSpaces } from "../spaces/space-queries";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { Card, EmptyState } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ErrorText } from "../ui/ErrorText";
import { isRaisedException } from "../supabase/errors";
import { SelectField } from "../ui/SelectField";
import { categoryLabel, categoryTree, kindName } from "./category";
import {
  type Category,
  useCategories,
  useCategoryHistory,
  useDeleteCategory,
  useUpdateCategory,
} from "./category-queries";
import { CategoryForm } from "./CategoryForm";
import { CategoryIcon } from "./CategoryIcon";

export function CategoryScreen() {
  const { t } = useTranslation();
  const { categoryId } = useParams();
  const { data: categories } = useCategories();
  const { data: spaces = [] } = useSpaces();
  if (!categories) return null;
  const category = categories.find(({ id }) => id === categoryId);
  if (!category) return <CategoryNotFound />;
  const space = spaces.find(({ id }) => id === category.space_id);
  const parent = categories.find(({ id }) => id === category.parent_id);

  // Keyed so that another category's screen starts with fresh forms rather than this one's.
  return (
    <div key={category.id} className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        {space && <BackLink to={`/spaces/${space.id}`} place={spaceName(space, t)} />}
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          <CategoryIcon icon={category.icon} color={category.color} />
          {category.name}
        </h1>
        <p className="text-sm text-zinc-500">
          {kindName(category.kind, t)}
          {parent && ` · ${t("categories.under", { parent: parent.name })}`}
        </p>
      </header>
      <EditCard category={category} />
      <DeleteCard category={category} categories={categories} />
      <HistoryCard category={category} />
    </div>
  );
}

function CategoryNotFound() {
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

function EditCard({ category }: { category: Category }) {
  const { t } = useTranslation();
  const updateCategory = useUpdateCategory(category.id);
  return (
    <Card title={t("categories.details")}>
      <CategoryForm
        spaceId={category.space_id}
        categoryId={category.id}
        initial={{
          name: category.name,
          kind: category.kind,
          icon: category.icon,
          color: category.color,
          parentId: category.parent_id,
        }}
        submitLabel={t("categories.form.save")}
        mutation={updateCategory}
        onSave={(details) => updateCategory.mutate(details)}
      />
    </Card>
  );
}

function DeleteCard({ category, categories }: { category: Category; categories: Category[] }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  if (categories.some(({ parent_id }) => parent_id === category.id)) {
    return (
      <Card title={t("categories.delete.title")}>
        <p className="text-sm text-zinc-500">{t("categories.delete.hasSubcategories")}</p>
      </Card>
    );
  }
  return (
    <Card title={t("categories.delete.title")}>
      <p className="text-sm text-zinc-500">{t("categories.delete.explained")}</p>
      <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
        {t("categories.delete.submit")}
      </Button>
      <DeleteDialog
        category={category}
        categories={categories}
        open={confirming}
        onClose={() => setConfirming(false)}
      />
    </Card>
  );
}

type DeleteDialogProps = {
  category: Category;
  categories: Category[];
  open: boolean;
  onClose: () => void;
};

function DeleteDialog({ category, categories, open, onClose }: DeleteDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deleteCategory = useDeleteCategory(category.id);
  // Null until the user picks, so the default follows the category if it's edited meanwhile.
  const [chosenTarget, setChosenTarget] = useState<string | null>(null);
  const count = category.transaction_count;
  const targets = categoryTree(
    categories.filter(
      ({ id, space_id, kind }) =>
        id !== category.id && space_id === category.space_id && kind === category.kind,
    ),
  ).flatMap(({ category, children }) => [category, ...children]);
  const choice = chosenTarget ?? category.parent_id;
  const target = targets.find(({ id }) => id === choice)?.id ?? "";
  const moveTo = count > 0 ? target : null;
  const confirm = () =>
    afterSuccess(deleteCategory.mutateAsync(moveTo), () =>
      navigate(`/spaces/${category.space_id}`),
    );
  const cancel = () => {
    setChosenTarget(null);
    deleteCategory.reset();
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={t("categories.delete.confirmTitle", { name: category.name })}
      confirmLabel={t("categories.delete.confirm")}
      danger
      canConfirm={moveTo !== ""}
      pending={deleteCategory.isPending}
      onConfirm={confirm}
      onCancel={cancel}
    >
      {count > 0 && targets.length === 0 && (
        <p>{t("categories.delete.nowhereToMove", { count, name: category.name })}</p>
      )}
      {count > 0 && targets.length > 0 && (
        <>
          <p>{t("categories.delete.hasTransactions", { count, name: category.name })}</p>
          <SelectField
            label={t("categories.delete.moveTo")}
            value={target}
            onChange={(event) => setChosenTarget(event.target.value)}
          >
            <option value="" disabled>
              {t("categories.delete.chooseTarget")}
            </option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {categoryLabel(target, categories)}
              </option>
            ))}
          </SelectField>
        </>
      )}
      {deleteCategory.error && (
        <ErrorText>
          {isRaisedException(deleteCategory.error)
            ? t("categories.errors.deleteRefused")
            : t("categories.errors.deleteFailed")}
        </ErrorText>
      )}
    </ConfirmDialog>
  );
}

function HistoryCard({ category }: { category: Category }) {
  const { t } = useTranslation();
  const { data: history } = useCategoryHistory(category.id);
  return (
    <Card title={t("categories.history")}>
      <ActivityList activity={history} />
    </Card>
  );
}
