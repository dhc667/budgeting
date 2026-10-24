import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useShownSpaces } from "../spaces/space-picker";
import { SpaceSelect } from "../spaces/SpaceSelect";
import { BackLink } from "../ui/BackLink";
import { Card } from "../ui/Card";
import { useCreateCounterparty } from "./counterparty-queries";
import { CounterpartyForm } from "./CounterpartyForm";

export function NewCounterpartyScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const spaces = useShownSpaces();
  const [chosenSpaceId, setChosenSpaceId] = useState<string>();
  const createCounterparty = useCreateCounterparty();
  if (!spaces) return null;
  const spaceId = (spaces.find(({ id }) => id === chosenSpaceId) ?? spaces[0]).id;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/" place={t("nav.home")} />
        <h1 className="text-2xl font-semibold">{t("counterparties.new.title")}</h1>
      </header>
      <Card title={t("counterparties.details")}>
        <CounterpartyForm
          initial={{ name: "", color: "slate" }}
          extraFields={
            <SpaceSelect
              label={t("counterparties.form.space")}
              spaces={spaces}
              value={spaceId}
              onChange={setChosenSpaceId}
            />
          }
          submitLabel={t("counterparties.new.submit")}
          mutation={createCounterparty}
          onSave={(details) =>
            createCounterparty.mutate(
              { ...details, spaceId },
              { onSuccess: (id) => void navigate(`/counterparties/${id}`) },
            )
          }
        />
      </Card>
    </div>
  );
}
