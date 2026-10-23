import type { TFunction } from "i18next";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccountOption } from "../accounts/account-options";
import { type Account, useAccounts } from "../accounts/account-queries";
import { categoryOptions } from "../categories/category-options";
import { type Category, useCategories } from "../categories/category-queries";
import { useFormat } from "../format/use-format";
import { useCurrencies } from "../money/currency-queries";
import { CurrencyPicker } from "../money/CurrencyPicker";
import { useProfile } from "../profile/profile-queries";
import { units } from "../recurring/schedule";
import { unitName } from "../recurring/recurring";
import { isCheckViolation } from "../supabase/errors";
import { Button } from "../ui/Button";
import { ChecklistField } from "../ui/ChecklistField";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { DateField } from "../ui/DateField";
import { choiceField, submitWith, textField } from "../ui/forms";
import { SelectField } from "../ui/SelectField";
import type { BudgetDetails } from "./budget-queries";

type BudgetFormProps = {
  initial: BudgetDetails;
  spaceId: string;
  // Shown above the rest, as the space chooser of a new budget is.
  extraFields?: ReactNode;
  submitLabel: string;
  mutation: { isPending: boolean; isSuccess: boolean; error: Error | null };
  onSave: (details: BudgetDetails) => void;
};

// Amounts are typed in the user's number format, so the form waits for the profile that says which.
export function BudgetForm(props: BudgetFormProps) {
  const { data: profile } = useProfile();
  const { data: currencies } = useCurrencies();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  if (!profile || !currencies || !accounts || !categories) return null;
  return <LoadedBudgetForm {...props} accounts={accounts} categories={categories} />;
}

type LoadedProps = BudgetFormProps & { accounts: Account[]; categories: Category[] };

function LoadedBudgetForm({
  initial,
  spaceId,
  extraFields,
  submitLabel,
  mutation,
  onSave,
  accounts,
  categories,
}: LoadedProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const accountOption = useAccountOption();
  const { data: currencies = [] } = useCurrencies();
  const [currency, setCurrency] = useState(initial.currency);
  const [length, setLength] = useState<LengthKind>(initial.length.kind);
  const [startsOn, setStartsOn] = useState(initial.startsOn);
  const [categoryIds, setCategoryIds] = useState(initial.categoryIds);
  const [accountIds, setAccountIds] = useState(initial.accountIds);
  const [amountInvalid, setAmountInvalid] = useState(false);
  const decimals = currencies.find(({ code }) => code === currency)?.decimals ?? 2;
  const offeredCategories = categories.filter(
    (category) => category.space_id === spaceId && category.kind === "expense",
  );
  const offeredAccounts = accounts.filter(
    (account) =>
      account.space_id === spaceId && (!account.archived || accountIds?.includes(account.id)),
  );
  const repeat = initial.length.kind === "repeating" ? initial.length : null;
  const endsOn = initial.length.kind === "fixed" ? initial.length.endsOn : "";

  const save = (form: FormData) => {
    const limit = format.parseAmount(textField(form, "amount"), decimals);
    setAmountInvalid(limit === null || limit <= 0);
    if (limit === null || limit <= 0) return;
    onSave({
      name: textField(form, "name").trim(),
      currency,
      limit,
      startsOn,
      length:
        length === "repeating"
          ? {
              kind: "repeating",
              every: Number(textField(form, "every")),
              unit: choiceField(form, "unit", units) ?? "month",
            }
          : { kind: "fixed", endsOn: textField(form, "endsOn") },
      carryUnspent: form.has("carryUnspent"),
      carryOverspent: form.has("carryOverspent"),
      categoryIds: offeredOnly(categoryIds, offeredCategories),
      accountIds: offeredOnly(accountIds, offeredAccounts),
    });
  };

  return (
    <form onSubmit={submitWith(save)} className="flex flex-col gap-4">
      {extraFields}
      <Field label={t("budgets.form.name")} name="name" defaultValue={initial.name} required />
      <CurrencyPicker label={t("budgets.form.currency")} value={currency} onChange={setCurrency} />
      {/* Keyed by currency: an amount typed for one currency means nothing in another. */}
      <Field
        key={currency}
        label={t("budgets.form.amount")}
        hint={t("budgets.form.amountHint")}
        name="amount"
        inputMode="decimal"
        autoComplete="off"
        required
        defaultValue={
          currency === initial.currency && initial.limit > 0
            ? format.amount(initial.limit, decimals)
            : ""
        }
        placeholder={format.amount(0, decimals)}
      />
      <div role="radiogroup" aria-label={t("budgets.form.length")} className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("budgets.form.length")}</span>
        {lengthKinds.map((kind) => (
          <label key={kind} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="length"
              value={kind}
              checked={length === kind}
              onChange={() => setLength(kind)}
              className="size-5"
            />
            {lengthName(kind, t)}
          </label>
        ))}
      </div>
      {length === "repeating" && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t("budgets.form.every")}
            name="every"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            defaultValue={repeat?.every ?? 1}
          />
          <SelectField
            label={t("budgets.form.unit")}
            name="unit"
            defaultValue={repeat?.unit ?? "month"}
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {unitName(unit, t)}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      <DateField
        label={t("budgets.form.startsOn")}
        hint={length === "repeating" ? t("budgets.form.startsOnHint") : undefined}
        name="startsOn"
        value={startsOn}
        onChange={(event) => setStartsOn(event.target.value)}
        required
      />
      {length === "fixed" && (
        <DateField
          label={t("budgets.form.endsOn")}
          name="endsOn"
          min={startsOn}
          defaultValue={endsOn}
          required
        />
      )}
      <ChecklistField
        label={t("budgets.form.categories")}
        groups={[{ heading: null, options: categoryOptions(offeredCategories) }]}
        value={categoryIds ?? []}
        onChange={(ids) => setCategoryIds(allIfNone(ids))}
        none={categoryIds ? t("budgets.form.noCategories") : t("budgets.form.allCategories")}
        several={(count) => t("budgets.form.someCategories", { count })}
      />
      <ChecklistField
        label={t("budgets.form.accounts")}
        groups={[{ heading: null, options: offeredAccounts.map(accountOption) }]}
        value={accountIds ?? []}
        onChange={(ids) => setAccountIds(allIfNone(ids))}
        none={accountIds ? t("budgets.form.noAccounts") : t("budgets.form.allAccounts")}
        several={(count) => t("budgets.form.someAccounts", { count })}
      />
      {length === "repeating" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t("budgets.form.carryOver")}</legend>
          <CarryOverChoice
            name="carryUnspent"
            defaultChecked={initial.carryUnspent}
            label={t("budgets.form.carryUnspent")}
            hint={t("budgets.form.carryUnspentHint")}
          />
          <CarryOverChoice
            name="carryOverspent"
            defaultChecked={initial.carryOverspent}
            label={t("budgets.form.carryOverspent")}
            hint={t("budgets.form.carryOverspentHint")}
          />
        </fieldset>
      )}
      {amountInvalid && (
        <ErrorText>
          {t("budgets.errors.amount", { example: format.amount(123456, decimals) })}
        </ErrorText>
      )}
      {mutation.error && <ErrorText>{saveErrorMessage(mutation.error, t)}</ErrorText>}
      {mutation.isSuccess && <p className="text-sm text-emerald-600">{t("budgets.form.saved")}</p>}
      <Button type="submit" disabled={mutation.isPending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

type CarryOverChoiceProps = {
  name: string;
  defaultChecked: boolean;
  label: string;
  hint: string;
};

function CarryOverChoice({ name, defaultChecked, label, hint }: CarryOverChoiceProps) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5" />
      <span className="flex flex-col">
        {label}
        <span className="text-xs text-zinc-500">{hint}</span>
      </span>
    </label>
  );
}

// Choosing none means all of them. Only deleting every chosen one leaves a budget covering none,
// which the form keeps rather than widening it to all on an unrelated edit.
function allIfNone(ids: string[]): string[] | null {
  return ids.length === 0 ? null : ids;
}

function offeredOnly(ids: string[] | null, offered: { id: string }[]): string[] | null {
  return ids && ids.filter((id) => offered.some((each) => each.id === id));
}

function lengthName(kind: LengthKind, t: TFunction): string {
  switch (kind) {
    case "repeating":
      return t("budgets.form.repeating");
    case "fixed":
      return t("budgets.form.fixed");
  }
}

function saveErrorMessage(error: Error, t: TFunction): string {
  if (isCheckViolation(error)) return t("budgets.errors.nameBlank");
  return t("budgets.errors.saveFailed");
}

const lengthKinds = ["repeating", "fixed"] as const;

type LengthKind = (typeof lengthKinds)[number];
