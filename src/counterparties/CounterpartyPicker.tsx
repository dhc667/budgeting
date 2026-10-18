import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ColorDot } from "../colors/ColorDot";
import { Picker } from "../ui/Picker";
import type { Counterparty } from "./read-counterparties";

type CounterpartyPickerProps = {
  counterparties: Counterparty[];
  value: string | null;
  onChange: (counterpartyId: string) => void;
};

export function CounterpartyPicker({ counterparties, value, onChange }: CounterpartyPickerProps) {
  const { t } = useTranslation();
  if (counterparties.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {t("transactions.form.noCounterparties")}{" "}
        <Link
          to="/counterparties/new"
          className="font-medium text-emerald-700 dark:text-emerald-400"
        >
          {t("counterparties.add")}
        </Link>
      </p>
    );
  }
  return (
    <Picker
      label={t("transactions.form.counterparty")}
      groups={[
        {
          heading: null,
          options: counterparties.map((counterparty) => ({
            id: counterparty.id,
            label: counterparty.name,
            content: (
              <>
                <ColorDot color={counterparty.color} />
                <span className="flex-1 truncate">{counterparty.name}</span>
              </>
            ),
          })),
        },
      ]}
      value={value}
      onChange={onChange}
      placeholder={t("transactions.form.chooseCounterparty")}
    />
  );
}
