import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useSignedInUser } from "../auth/session";
import { useUsers } from "../profile/profile-queries";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { submitWith, textField } from "../ui/forms";
import { nameErrorMessage } from "./space";
import { useCreateSpace } from "./space-queries";

export function NewSpaceScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/spaces" place={t("spaces.title")} />
        <h1 className="text-2xl font-semibold">{t("spaces.new.title")}</h1>
      </header>
      <NewSpaceForm />
    </div>
  );
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
    <Card title={t("spaces.new.details")}>
      <form onSubmit={submitWith(create)} className="flex flex-col gap-4">
        <Field label={t("spaces.name")} name="name" required />
        {others.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">{t("spaces.new.members")}</legend>
            {/* Cut mid-row when it scrolls, so the cut shows there's more. */}
            <div className="flex max-h-60 flex-col overflow-y-auto rounded-lg border border-zinc-200 px-3 dark:border-zinc-800">
              {others.map((user) => (
                <label key={user.id} className="flex min-h-11 shrink-0 items-center gap-3">
                  <input type="checkbox" name="members" value={user.id} className="size-5" />
                  {user.display_name}
                </label>
              ))}
            </div>
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
