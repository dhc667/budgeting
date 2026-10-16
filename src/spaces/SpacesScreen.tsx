import type { TFunction } from "i18next";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { useSignedInUser } from "../auth/session";
import { useUsers } from "../profile/profile-queries";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { submitWith, textField } from "../ui/forms";
import { isPrivate, nameErrorMessage, spaceName } from "./space";
import { type Space, useCreateSpace, useSpaces } from "./space-queries";

export function SpacesScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/profile" place={t("profile.title")} />
        <h1 className="text-2xl font-semibold">{t("spaces.title")}</h1>
      </header>
      <SpaceList />
      <NewSpaceForm />
    </div>
  );
}

function SpaceList() {
  const { t } = useTranslation();
  const { data: spaces = [] } = useSpaces();
  return (
    <Card title={t("spaces.yours")}>
      <ul className="-mx-2 flex flex-col">
        {spaces.map((space) => (
          <li key={space.id}>
            <Link
              to={`/spaces/${space.id}`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="flex flex-col">
                <span className="font-medium">{spaceName(space, t)}</span>
                <span className="text-sm text-zinc-500">{membersSummary(space, t)}</span>
              </span>
              <ChevronRight className="size-5 text-zinc-400" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function membersSummary(space: Space, t: TFunction): string {
  if (isPrivate(space)) return t("spaces.onlyYou");
  return t("spaces.memberCount", { count: space.members.length });
}

function NewSpaceForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useSignedInUser();
  const { data: users = [] } = useUsers();
  const createSpace = useCreateSpace();
  const others = users.filter(({ id }) => id !== me.id);
  const create = (form: FormData) =>
    createSpace.mutate(
      { name: textField(form, "name").trim(), memberIds: form.getAll("members").map(String) },
      { onSuccess: (spaceId) => void navigate(`/spaces/${spaceId}`) },
    );

  return (
    <Card title={t("spaces.new.title")}>
      <form onSubmit={submitWith(create)} className="flex flex-col gap-4">
        <Field label={t("spaces.name")} name="name" required />
        {others.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">{t("spaces.new.members")}</legend>
            {others.map((user) => (
              <label key={user.id} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="members" value={user.id} className="size-5" />
                {user.display_name}
              </label>
            ))}
          </fieldset>
        )}
        {createSpace.error && <ErrorText>{nameErrorMessage(createSpace.error, t)}</ErrorText>}
        <Button type="submit" disabled={createSpace.isPending} className="self-start">
          {t("spaces.new.submit")}
        </Button>
      </form>
    </Card>
  );
}
