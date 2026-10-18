import type { TFunction } from "i18next";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { useCurrencies } from "../money/currency-queries";
import { CurrencyPicker } from "../money/CurrencyPicker";
import { useProfile } from "../profile/profile-queries";
import { isCheckViolation } from "../supabase/errors";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { choiceField, submitWith, textField } from "../ui/forms";
import { ColorChoice } from "../colors/ColorChoice";
import { colors } from "../colors/colors";
import type { AccountDetails } from "./account-writes";

type AccountFormProps = {
  initial: AccountDetails;
  currencyFixed: boolean;
  extraFields?: ReactNode;
  submitLabel: string;
  mutation: { isPending: boolean; isSuccess: boolean; error: Error | null };
  onSave: (details: AccountDetails) => void;
};

// Amounts are typed in the user's number format, so the form waits for the profile that says which.
export function AccountForm(props: AccountFormProps) {
  const { data: profile } = useProfile();
  const { data: currencies } = useCurrencies();
  if (!profile || !currencies) return null;
  return <LoadedAccountForm {...props} />;
}

function LoadedAccountForm({
  initial,
  currencyFixed,
  extraFields,
  submitLabel,
  mutation,
  onSave,
}: AccountFormProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: currencies = [] } = useCurrencies();
  const [currency, setCurrency] = useState(initial.currency);
  const [amountInvalid, setAmountInvalid] = useState(false);
  const decimals = currencies.find(({ code }) => code === currency)?.decimals ?? 2;
  const currencyChanged = currency !== initial.currency;

  const save = (form: FormData) => {
    const amountText = textField(form, "openingAmount");
    const openingAmount = amountText.trim() === "" ? 0 : format.parseAmount(amountText, decimals);
    setAmountInvalid(openingAmount === null);
    if (openingAmount === null) return;
    onSave({
      name: textField(form, "name").trim(),
      currency,
      color: choiceField(form, "color", colors) ?? initial.color,
      openingAmount,
      openingDate: textField(form, "openingDate"),
    });
  };

  return (
    <form onSubmit={submitWith(save)} className="flex flex-col gap-4">
      {extraFields}
      <Field label={t("accounts.form.name")} name="name" defaultValue={initial.name} required />
      <CurrencyPicker
        label={t("accounts.form.currency")}
        hint={currencyFixed ? t("accounts.form.currencyFixed") : undefined}
        value={currency}
        onChange={setCurrency}
        disabled={currencyFixed}
      />
      <ColorChoice defaultValue={initial.color} />
      {/* Keyed by currency: an amount typed for one currency means nothing in another. */}
      <Field
        key={currency}
        label={t("accounts.form.openingBalance")}
        hint={
          currencyChanged
            ? t("accounts.form.currencyChanged", { currency })
            : t("accounts.form.openingBalanceHint")
        }
        name="openingAmount"
        defaultValue={
          currencyChanged || initial.openingAmount === 0
            ? ""
            : format.amount(initial.openingAmount, decimals)
        }
        placeholder={format.amount(0, decimals)}
        required={currencyChanged}
        autoComplete="off"
      />
      <Field
        label={t("accounts.form.openingDate")}
        name="openingDate"
        type="date"
        defaultValue={initial.openingDate}
        max={localToday()}
        required
      />
      {amountInvalid && (
        <ErrorText>
          {t("accounts.errors.amount", { example: format.amount(-123456, decimals) })}
        </ErrorText>
      )}
      {mutation.error && <ErrorText>{saveErrorMessage(mutation.error, t)}</ErrorText>}
      {mutation.isSuccess && <p className="text-sm text-emerald-600">{t("accounts.form.saved")}</p>}
      <Button type="submit" disabled={mutation.isPending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

function saveErrorMessage(error: Error, t: TFunction): string {
  if (isCheckViolation(error)) return t("accounts.errors.nameBlank");
  return t("accounts.errors.saveFailed");
}
