import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { localToday } from "../format/days";
import { useProfile } from "../profile/profile-queries";
import { spaceName } from "../spaces/space";
import { type Space, useSpaces } from "../spaces/space-queries";
import { Card } from "../ui/Card";
import { SelectField } from "../ui/SelectField";
import { useCreateAccount } from "./account-queries";
import { AccountForm } from "./AccountForm";

export function NewAccountScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: spaces } = useSpaces();
  const [chosenSpaceId, setChosenSpaceId] = useState<string>();
  const createAccount = useCreateAccount();
  const spaceId = chosenSpaceId ?? spaces?.[0]?.id;
  if (!profile || !spaces || !spaceId) return null;

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
          extraFields={<SpaceSelect spaces={spaces} value={spaceId} onChange={setChosenSpaceId} />}
          submitLabel={t("accounts.new.submit")}
          mutation={createAccount}
          onSave={(details) =>
            createAccount.mutate(
              { ...details, spaceId },
              { onSuccess: (accountId) => void navigate(`/accounts/${accountId}`) },
            )
          }
        />
      </Card>
    </div>
  );
}

type SpaceSelectProps = {
  spaces: Space[];
  value: string;
  onChange: (spaceId: string) => void;
};

// Every space is offered, whatever the space picker shows.
function SpaceSelect({ spaces, value, onChange }: SpaceSelectProps) {
  const { t } = useTranslation();
  return (
    <SelectField
      label={t("accounts.form.space")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {spaces.map((space) => (
        <option key={space.id} value={space.id}>
          {spaceName(space, t)}
        </option>
      ))}
    </SelectField>
  );
}
