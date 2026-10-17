import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Account } from "../accounts/account-queries";
import { categoryLabel, categoryTree } from "../categories/category";
import type { Category } from "../categories/category-queries";
import { spaceName } from "../spaces/space";
import type { Space } from "../spaces/space-queries";
import { Button } from "../ui/Button";
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
        <div className="grid gap-3 sm:grid-cols-2">
          {shownSpaces.length > 1 && (
            <SelectField
              label={t("transactions.filters.space")}
              value={values.space}
              onChange={(event) => change({ space: event.target.value, account: "", category: "" })}
            >
              <option value="">{t("transactions.filters.allSpaces")}</option>
              {shownSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {spaceName(space, t)}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            label={t("transactions.filters.account")}
            value={values.account}
            onChange={(event) => change({ account: event.target.value })}
          >
            <option value="">{t("transactions.filters.allAccounts")}</option>
            <BySpace spaces={spaces} items={accounts}>
              {(inSpace) =>
                inSpace.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))
              }
            </BySpace>
          </SelectField>
          <SelectField
            label={t("transactions.filters.category")}
            value={values.category}
            onChange={(event) => change({ category: event.target.value })}
          >
            <option value="">{t("transactions.filters.allCategories")}</option>
            <BySpace spaces={spaces} items={categories}>
              {(inSpace) =>
                categoryTree(inSpace).flatMap(({ category, children }) =>
                  [category, ...children].map((each) => (
                    <option key={each.id} value={each.id}>
                      {categoryLabel(each, inSpace)}
                    </option>
                  )),
                )
              }
            </BySpace>
          </SelectField>
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

type BySpaceProps<Item> = {
  spaces: Space[];
  items: Item[];
  children: (inSpace: Item[]) => ReactNode;
};

// Names repeat from space to space, so with more than one in play each gets its own group.
function BySpace<Item extends { space_id: string }>({
  spaces,
  items,
  children,
}: BySpaceProps<Item>) {
  const { t } = useTranslation();
  if (spaces.length === 1) return children(items);
  return spaces.map((space) => (
    <optgroup key={space.id} label={spaceName(space, t)}>
      {children(items.filter(({ space_id }) => space_id === space.id))}
    </optgroup>
  ));
}
