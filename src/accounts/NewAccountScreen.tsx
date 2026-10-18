import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { localToday } from "../format/days";
import { useProfile } from "../profile/profile-queries";
import { useSpaces } from "../spaces/space-queries";
import { SpaceSelect } from "../spaces/SpaceSelect";
import { BackLink } from "../ui/BackLink";
import { Card } from "../ui/Card";
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
      <header className="flex flex-col gap-1">
        <BackLink to="/" place={t("nav.home")} />
        <h1 className="text-2xl font-semibold">{t("accounts.new.title")}</h1>
      </header>
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
          extraFields={
            <SpaceSelect
              label={t("accounts.form.space")}
              spaces={spaces}
              value={spaceId}
              onChange={setChosenSpaceId}
            />
          }
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
