import type { TFunction } from "i18next";
import { createElement, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ColorChoice } from "../colors/ColorChoice";
import { colors } from "../colors/colors";
import { isCheckViolation, isRaisedException } from "../supabase/errors";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { choiceField, submitWith, textField } from "../ui/forms";
import { SelectField } from "../ui/SelectField";
import { categoryKinds, categoryTree, kindName } from "./category";
import { type CategoryKind, useCategories } from "./category-queries";
import type { CategoryDetails } from "./category-writes";
import { iconFor, iconLabel, iconNames } from "./icons";

type CategoryFormProps = {
  spaceId: string;
  // The category being edited, which can't be its own parent.
  categoryId?: string;
  // A built-in category keeps its name, kind and place: only its looks change.
  builtIn?: boolean;
  initial: CategoryDetails;
  submitLabel: string;
  mutation: { isPending: boolean; isSuccess: boolean; error: Error | null };
  onSave: (details: CategoryDetails) => void;
};

export function CategoryForm({
  spaceId,
  categoryId,
  builtIn = false,
  initial,
  submitLabel,
  mutation,
  onSave,
}: CategoryFormProps) {
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  const [parentId, setParentId] = useState(initial.parentId);
  const [ownKind, setOwnKind] = useState(initial.kind);
  const parent = categories.find(({ id }) => id === parentId);
  const kind = parent?.kind ?? ownKind;
  const hasSubcategories = categories.some(({ parent_id }) => parent_id === categoryId);
  const parents = categoryTree(
    categories.filter(
      ({ space_id, id, built_in }) =>
        space_id === spaceId && id !== categoryId && built_in === null,
    ),
  ).map(({ category }) => category);

  const save = (form: FormData) =>
    onSave({
      name: builtIn ? initial.name : textField(form, "name").trim(),
      kind,
      icon: choiceField(form, "icon", iconNames) ?? initial.icon,
      color: choiceField(form, "color", colors) ?? initial.color,
      parentId,
    });

  return (
    <form onSubmit={submitWith(save)} className="flex flex-col gap-4">
      {builtIn ? (
        <p className="text-sm text-zinc-500">{t("categories.form.builtIn")}</p>
      ) : (
        <>
          <Field
            label={t("categories.form.name")}
            name="name"
            defaultValue={initial.name}
            required
          />
          <SelectField
            label={t("categories.form.parent")}
            hint={hasSubcategories ? t("categories.form.parentFixed") : undefined}
            value={parentId ?? ""}
            onChange={(event) => setParentId(event.target.value || null)}
            disabled={hasSubcategories}
          >
            <option value="">{t("categories.form.noParent")}</option>
            {categoryKinds.map((parentKind) => {
              const ofKind = parents.filter((category) => category.kind === parentKind);
              return (
                ofKind.length > 0 && (
                  <optgroup key={parentKind} label={kindName(parentKind, t)}>
                    {ofKind.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </optgroup>
                )
              );
            })}
          </SelectField>
          <KindChoice
            value={kind}
            onChange={setOwnKind}
            disabled={parent !== undefined}
            hint={
              parent
                ? t("categories.form.kindFromParent")
                : hasSubcategories
                  ? t("categories.form.kindForSubcategories")
                  : undefined
            }
          />
        </>
      )}
      <IconChoice defaultValue={initial.icon} />
      <ColorChoice defaultValue={initial.color} />
      {mutation.error && <ErrorText>{saveErrorMessage(mutation.error, t)}</ErrorText>}
      {mutation.isSuccess && (
        <p className="text-sm text-emerald-600">{t("categories.form.saved")}</p>
      )}
      <Button type="submit" disabled={mutation.isPending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

type KindChoiceProps = {
  value: CategoryKind;
  onChange: (kind: CategoryKind) => void;
  disabled: boolean;
  hint: string | undefined;
};

function KindChoice({ value, onChange, disabled, hint }: KindChoiceProps) {
  const { t } = useTranslation();
  const hintId = useId();
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      disabled={disabled}
      aria-describedby={hint ? hintId : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium">{t("categories.form.kind")}</legend>
      <div className="flex flex-wrap gap-x-6">
        {categoryKinds.map((kind) => (
          <label key={kind} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="kind"
              value={kind}
              checked={kind === value}
              onChange={() => onChange(kind)}
              className="size-5"
            />
            {kindName(kind, t)}
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
    </fieldset>
  );
}

function IconChoice({ defaultValue }: { defaultValue: string }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{t("categories.form.icon")}</legend>
      <div className="flex flex-wrap">
        {iconNames.map((name) => (
          <label key={name} title={iconLabel(name, t)} className="cursor-pointer">
            <input
              type="radio"
              name="icon"
              value={name}
              defaultChecked={name === defaultValue}
              className="peer sr-only"
            />
            <span className="flex size-11 items-center justify-center rounded-lg text-zinc-700 peer-checked:bg-zinc-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-600 dark:text-zinc-300 dark:peer-checked:bg-zinc-100 dark:peer-checked:text-zinc-900">
              {createElement(iconFor(name), { "aria-hidden": true, className: "size-5" })}
            </span>
            <span className="sr-only">{iconLabel(name, t)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function saveErrorMessage(error: Error, t: TFunction): string {
  if (isCheckViolation(error)) return t("categories.errors.nameBlank");
  if (isRaisedException(error)) return t("categories.errors.saveRefused");
  return t("categories.errors.saveFailed");
}
