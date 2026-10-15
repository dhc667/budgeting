import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { localToday } from "../format/days";
import { useProfile } from "../profile/profile-queries";
import { spaceName } from "../spaces/space";
import { type Space, useSpaces } from "../spaces/space-queries";
import { Card } from "../ui/Card";
import { textField } from "../ui/forms";
import { SelectField } from "../ui/SelectField";
import { useCreateAccount } from "./account-queries";
import { AccountForm } from "./AccountForm";

export function NewAccountScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: spaces } = useSpaces();
  const createAccount = useCreateAccount();
  if (!profile || !spaces) return null;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("accounts.new.title")}</h1>
      <Card title={t("accounts.details")}>
        <AccountForm
          initial={{
            name: "",
            currency: profile.display_currency,
            color: "blue",
            openingAmount: 0,
            openingDate: localToday(),
          }}
          currencyFixed={false}
          extraFields={<SpaceSelect spaces={spaces} />}
          submitLabel={t("accounts.new.submit")}
          mutation={createAccount}
          onSave={(details, form) =>
            createAccount.mutate(
              { ...details, spaceId: textField(form, "space") },
              { onSuccess: (accountId) => void navigate(`/accounts/${accountId}`) },
            )
          }
        />
      </Card>
    </div>
  );
}

// Every space is offered, whatever the space picker shows.
function SpaceSelect({ spaces }: { spaces: Space[] }) {
  const { t } = useTranslation();
  return (
    <SelectField label={t("accounts.form.space")} name="space" defaultValue={spaces[0]?.id}>
      {spaces.map((space) => (
        <option key={space.id} value={space.id}>
          {spaceName(space, t)}
        </option>
      ))}
    </SelectField>
  );
}
