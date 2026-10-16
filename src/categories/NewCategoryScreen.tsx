import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { spaceName } from "../spaces/space";
import { useSpaces } from "../spaces/space-queries";
import { SpaceNotFound } from "../spaces/SpaceScreen";
import { BackLink } from "../ui/BackLink";
import { Card } from "../ui/Card";
import { useCreateCategory } from "./category-queries";
import { CategoryForm } from "./CategoryForm";

export function NewCategoryScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { spaceId } = useParams();
  const { data: spaces } = useSpaces();
  const createCategory = useCreateCategory();
  if (!spaces) return null;
  const space = spaces.find(({ id }) => id === spaceId);
  if (!space) return <SpaceNotFound />;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to={`/spaces/${space.id}`} place={spaceName(space, t)} />
        <h1 className="text-2xl font-semibold">{t("categories.new.title")}</h1>
      </header>
      <Card title={t("categories.details")}>
        <CategoryForm
          spaceId={space.id}
          initial={{ name: "", kind: "expense", icon: "tag", color: "blue", parentId: null }}
          submitLabel={t("categories.new.submit")}
          mutation={createCategory}
          onSave={(details) =>
            createCategory.mutate(
              { ...details, spaceId: space.id },
              { onSuccess: (categoryId) => void navigate(`/categories/${categoryId}`) },
            )
          }
        />
      </Card>
    </div>
  );
}
