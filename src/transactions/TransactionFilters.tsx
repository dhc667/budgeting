import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccountOption } from "../accounts/account-options";
import type { Account } from "../accounts/account-queries";
import { categoryOptions } from "../categories/category-options";
import type { Category } from "../categories/category-queries";
import { bySpace } from "../spaces/by-space";
import { spaceName } from "../spaces/space";
import type { Space } from "../spaces/space-queries";
import { Button } from "../ui/Button";
import { ChecklistField } from "../ui/ChecklistField";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { activeCount, type ListFilters } from "./list-filters";

type TransactionFiltersProps = {
  values: ListFilters;
  change: (changes: Partial<ListFilters>) => void;
  clear: () => void;
  shownSpaces: Space[];
  // Those of the spaces in play, which the space chosen narrows.
  spaces: Space[];
  accounts: Account[];
  categories: Category[];
};

export function TransactionFilters({
  values,
  change,
  clear,
  shownSpaces,
  spaces,
  accounts,
  categories,
}: TransactionFiltersProps) {
  const { t } = useTranslation();
  const accountOption = useAccountOption();
  const count = activeCount(values);
  const [open, setOpen] = useState(count > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
          <SlidersHorizontal className="size-4" />
          {count > 0
            ? t("transactions.filters.toggleCount", { count })
            : t("transactions.filters.toggle")}
        </Button>
        {count > 0 && (
          <Button variant="secondary" onClick={clear}>
            {t("transactions.filters.clear")}
          </Button>
        )}
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shownSpaces.length > 1 && (
            <SelectField
              label={t("transactions.filters.space")}
              value={values.space}
              onChange={(event) => change({ space: event.target.value, account: [], category: [] })}
            >
              <option value="">{t("transactions.filters.allSpaces")}</option>
              {shownSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {spaceName(space, t)}
                </option>
              ))}
            </SelectField>
          )}
          <ChecklistField
            label={t("transactions.filters.account")}
            groups={bySpace(spaces, accounts, t, (inSpace) => inSpace.map(accountOption))}
            value={values.account}
            onChange={(account) => change({ account })}
            none={t("transactions.filters.allAccounts")}
            several={(count) => t("transactions.filters.someAccounts", { count })}
          />
          <ChecklistField
            label={t("transactions.filters.category")}
            groups={bySpace(spaces, categories, t, categoryOptions)}
            value={values.category}
            onChange={(category) => change({ category })}
            none={t("transactions.filters.allCategories")}
            several={(count) => t("transactions.filters.someCategories", { count })}
          />
          <Field
            type="date"
            label={t("transactions.filters.from")}
            value={values.from}
            max={values.to || undefined}
            onChange={(event) => change({ from: event.target.value })}
          />
          <Field
            type="date"
            label={t("transactions.filters.to")}
            value={values.to}
            min={values.from || undefined}
            onChange={(event) => change({ to: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}
