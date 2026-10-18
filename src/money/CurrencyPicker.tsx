import { useTranslation } from "react-i18next";
import { currencyName } from "../format/format";
import { Picker } from "../ui/Picker";
import { useCurrencies } from "./currency-queries";

type CurrencyPickerProps = {
  label: string;
  hint?: string;
  value: string;
  onChange: (code: string) => void;
  name?: string;
  disabled?: boolean;
  only?: ReadonlySet<string>;
};

// Found by code or by name, in the language the app shows.
export function CurrencyPicker({ only, ...props }: CurrencyPickerProps) {
  const { t, i18n } = useTranslation();
  const { data: currencies = [] } = useCurrencies();
  // Until the list arrives, the selected currency alone keeps the field from showing a blank.
  const codes =
    currencies.length > 0
      ? currencies.map(({ code }) => code).filter((code) => !only || only.has(code))
      : [props.value];
  const options = codes.map((code) => {
    const label = `${code} · ${currencyName(code, i18n.language)}`;
    return { id: code, label, content: <span className="flex-1 truncate">{label}</span> };
  });
  return (
    <Picker
      {...props}
      groups={[{ heading: null, options }]}
      placeholder={t("money.chooseCurrency")}
    />
  );
}
