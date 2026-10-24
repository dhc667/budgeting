import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { localToday } from "../format/days";
import { useProfile } from "../profile/profile-queries";
import { useShownSpaces } from "../spaces/space-picker";
import { useSpaces } from "../spaces/space-queries";
import { SpaceSelect } from "../spaces/SpaceSelect";
import { BackLink } from "../ui/BackLink";
import { Card } from "../ui/Card";
import { useCreateBudget } from "./budget-queries";
import { BudgetForm } from "./BudgetForm";

export function NewBudgetScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: spaces } = useSpaces();
  const shownSpaces = useShownSpaces();
  const [chosenSpaceId, setChosenSpaceId] = useState<string>();
  const createBudget = useCreateBudget();
  const spaceId = chosenSpaceId ?? shownSpaces?.[0]?.id ?? spaces?.[0]?.id;
  if (!profile || !spaces || !spaceId) return null;

  // Keyed by space: the categories and accounts chosen belong to the one it was.
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/budgets" place={t("budgets.title")} />
        <h1 className="text-2xl font-semibold">{t("budgets.new.title")}</h1>
      </header>
      <Card title={t("budgets.details")}>
        <BudgetForm
          key={spaceId}
          initial={{
            name: "",
            currency: profile.display_currency,
            limit: 0,
            startsOn: localToday(),
            length: { kind: "repeating", every: 1, unit: "month" },
            carryUnspent: false,
            carryOverspent: false,
            categoryIds: null,
            accountIds: null,
          }}
          spaceId={spaceId}
          extraFields={
            <SpaceSelect
              label={t("budgets.form.space")}
              spaces={spaces}
              value={spaceId}
              onChange={setChosenSpaceId}
            />
          }
          submitLabel={t("budgets.new.submit")}
          mutation={createBudget}
          onSave={(details) =>
            createBudget.mutate(
              { ...details, spaceId },
              { onSuccess: (budgetId) => void navigate(`/budgets/${budgetId}`) },
            )
          }
        />
      </Card>
    </div>
  );
}
