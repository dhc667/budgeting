import { useTranslation } from "react-i18next";
import { ColorDot } from "../colors/ColorDot";
import { Picker, type PickerOption } from "../ui/Picker";
import type { Counterparty } from "./read-counterparties";

type CounterpartyPickerProps = {
  counterparties: Counterparty[];
  // One typed into the picker, added when the transaction is saved.
  named: { id: string; name: string } | null;
  value: string | null;
  onChange: (counterpartyId: string) => void;
  onName: (name: string) => void;
};

export function CounterpartyPicker({
  counterparties,
  named,
  value,
  onChange,
  onName,
}: CounterpartyPickerProps) {
  const { t } = useTranslation();
  const options: PickerOption[] = counterparties.map(({ id, name, color }) => ({
    id,
    label: name,
    icon: <ColorDot color={color} />,
    content: (
      <>
        <ColorDot color={color} />
        <span className="flex-1 truncate">{name}</span>
      </>
    ),
  }));
  if (named) {
    options.push({
      id: named.id,
      label: named.name,
      content: <span className="flex-1 truncate">{named.name}</span>,
    });
  }
  return (
    <Picker
      label={t("transactions.form.counterparty")}
      hint={
        named && value === named.id
          ? t("transactions.form.newCounterpartyHint", { name: named.name })
          : undefined
      }
      groups={[{ heading: null, options }]}
      value={value}
      onChange={onChange}
      placeholder={t("transactions.form.chooseCounterparty")}
      create={{
        label: (name) => t("transactions.form.newCounterparty", { name }),
        onCreate: onName,
      }}
    />
  );
}
