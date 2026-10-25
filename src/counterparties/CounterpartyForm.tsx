import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ColorChoice } from "../colors/ColorChoice";
import { colors } from "../colors/colors";
import { findNamed } from "../names";
import { isUniqueViolation, violatedConstraint } from "../supabase/errors";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { choiceField, submitWith, textField } from "../ui/forms";
import { useNameField } from "../ui/name-field";
import { useCounterparties } from "./counterparty-queries";
import type { CounterpartyDetails } from "./counterparty-writes";

type CounterpartyFormProps = {
  spaceId: string;
  // The counterparty being edited, whose name is its own to keep.
  counterpartyId?: string;
  initial: CounterpartyDetails;
  extraFields?: ReactNode;
  submitLabel: string;
  mutation: { isPending: boolean; isSuccess: boolean; error: Error | null };
  onSave: (details: CounterpartyDetails) => void;
};

export function CounterpartyForm({
  spaceId,
  counterpartyId,
  initial,
  extraFields,
  submitLabel,
  mutation,
  onSave,
}: CounterpartyFormProps) {
  const { t } = useTranslation();
  const { data: counterparties = [] } = useCounterparties();
  const nameField = useNameField(initial.name, mutation.error);
  const clash = findNamed(
    counterparties.filter(({ id, space_id }) => space_id === spaceId && id !== counterpartyId),
    nameField.name,
  );
  const save = (form: FormData) => {
    if (clash) return;
    const name = textField(form, "name").trim();
    nameField.saving(name);
    onSave({ name, color: choiceField(form, "color", colors) ?? initial.color });
  };

  return (
    <form onSubmit={submitWith(save)} className="flex flex-col gap-4">
      {extraFields}
      <Field
        label={t("counterparties.form.name")}
        hint={t("counterparties.form.nameHint")}
        name="name"
        defaultValue={initial.name}
        onChange={(event) => nameField.setName(event.target.value)}
        error={
          clash || nameField.refused
            ? t("counterparties.errors.nameTaken", { name: clash?.name ?? nameField.name })
            : undefined
        }
        required
      />
      <ColorChoice defaultValue={initial.color} />
      {mutation.error && !isUniqueViolation(mutation.error) && (
        <ErrorText>{saveErrorMessage(mutation.error, t)}</ErrorText>
      )}
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
  if (violatedConstraint(error) === "name_not_blank") return t("counterparties.errors.nameBlank");
  return t("counterparties.errors.saveFailed");
}
