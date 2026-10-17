import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { currencyName } from "../format/format";
import { SelectField } from "../ui/SelectField";
import { useCurrencies } from "./currency-queries";

type CurrencySelectProps = ComponentProps<typeof SelectField> & { only?: ReadonlySet<string> };

export function CurrencySelect({ only, ...props }: CurrencySelectProps) {
  const { i18n } = useTranslation();
  const { data: currencies = [] } = useCurrencies();
  const selected = String(props.value ?? props.defaultValue);
  // Until the list arrives, the selected currency alone keeps the select from showing a blank.
  const codes =
    currencies.length > 0
      ? currencies.map(({ code }) => code).filter((code) => !only || only.has(code))
      : [selected];
  return (
    <SelectField {...props}>
      {codes.map((code) => (
        <option key={code} value={code}>
          {code} · {currencyName(code, i18n.language)}
        </option>
      ))}
    </SelectField>
  );
}
