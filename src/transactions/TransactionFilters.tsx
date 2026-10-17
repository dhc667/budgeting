import { SlidersHorizontal } from "lucide-react";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Account } from "../accounts/account-queries";
import { categoryLabel, categoryTree } from "../categories/category";
import type { Category } from "../categories/category-queries";
import { spaceName } from "../spaces/space";
import type { Space } from "../spaces/space-queries";
import { Button } from "../ui/Button";
import { type ChecklistGroup, ChecklistField } from "../ui/ChecklistField";
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
            summary={summary(accounts, values.account, ({ name }) => name, {
              none: t("transactions.filters.allAccounts"),
              several: (count) => t("transactions.filters.someAccounts", { count }),
            })}
            groups={bySpace(spaces, accounts, t, (inSpace) =>
              inSpace.map(({ id, name }) => ({ id, label: name })),
            )}
            value={values.account}
            onChange={(account) => change({ account })}
          />
          <ChecklistField
            label={t("transactions.filters.category")}
            summary={summary(
              categories,
              values.category,
              (category) => categoryLabel(category, categories),
              {
                none: t("transactions.filters.allCategories"),
                several: (count) => t("transactions.filters.someCategories", { count }),
              },
            )}
            groups={bySpace(spaces, categories, t, (inSpace) =>
              categoryTree(inSpace).flatMap(({ category, children }) =>
                [category, ...children].map((each) => ({
                  id: each.id,
                  label: categoryLabel(each, inSpace),
                })),
              ),
            )}
            value={values.category}
            onChange={(category) => change({ category })}
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

// Names repeat from space to space, so with more than one in play each gets its own group.
function bySpace<Item extends { space_id: string }>(
  spaces: Space[],
  items: Item[],
  t: TFunction,
  options: (inSpace: Item[]) => ChecklistGroup["options"],
): ChecklistGroup[] {
  if (spaces.length === 1) return [{ options: options(items) }];
  return spaces.map((space) => ({
    label: spaceName(space, t),
    options: options(items.filter(({ space_id }) => space_id === space.id)),
  }));
}

function summary<Item extends { id: string }>(
  items: Item[],
  chosenIds: string[],
  nameOf: (item: Item) => string,
  { none, several }: { none: string; several: (count: number) => string },
): string {
  const chosen = items.filter(({ id }) => chosenIds.includes(id));
  const [only] = chosen;
  if (chosen.length === 0) return none;
  if (chosen.length === 1 && only) return nameOf(only);
  return several(chosen.length);
}
