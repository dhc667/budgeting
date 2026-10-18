import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ColorChoice } from "../colors/ColorChoice";
import { colors } from "../colors/colors";
import { isCheckViolation } from "../supabase/errors";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { choiceField, submitWith, textField } from "../ui/forms";
import type { CounterpartyDetails } from "./counterparty-writes";

type CounterpartyFormProps = {
  initial: CounterpartyDetails;
  extraFields?: ReactNode;
  submitLabel: string;
  mutation: { isPending: boolean; isSuccess: boolean; error: Error | null };
  onSave: (details: CounterpartyDetails) => void;
};

export function CounterpartyForm({
  initial,
  extraFields,
  submitLabel,
  mutation,
  onSave,
}: CounterpartyFormProps) {
  const { t } = useTranslation();
  const save = (form: FormData) =>
    onSave({
      name: textField(form, "name").trim(),
      color: choiceField(form, "color", colors) ?? initial.color,
    });

  return (
    <form onSubmit={submitWith(save)} className="flex flex-col gap-4">
      {extraFields}
      <Field
        label={t("counterparties.form.name")}
        hint={t("counterparties.form.nameHint")}
        name="name"
        defaultValue={initial.name}
        required
      />
      <ColorChoice defaultValue={initial.color} />
      {mutation.error && <ErrorText>{saveErrorMessage(mutation.error, t)}</ErrorText>}
      {mutation.isSuccess && (
        <p className="text-sm text-emerald-600">{t("counterparties.form.saved")}</p>
      )}
      <Button type="submit" disabled={mutation.isPending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

function saveErrorMessage(error: Error, t: TFunction): string {
  if (isCheckViolation(error)) return t("counterparties.errors.nameBlank");
  return t("counterparties.errors.saveFailed");
}
