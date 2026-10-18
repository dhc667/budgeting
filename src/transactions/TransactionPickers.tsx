import { useTranslation } from "react-i18next";
import { useAccountOption } from "../accounts/account-options";
import type { Account } from "../accounts/account-queries";
import { categoryOptions } from "../categories/category-options";
import type { Category } from "../categories/category-queries";
import { bySpace } from "../spaces/by-space";
import type { Space } from "../spaces/space-queries";
import { Picker } from "../ui/Picker";

type AccountPickerProps = {
  label: string;
  accounts: Account[];
  spaces: Space[];
  value: string | null;
  onChange: (accountId: string) => void;
};

// Every space's accounts are offered, whatever the space picker shows.
export function AccountPicker({ label, accounts, spaces, value, onChange }: AccountPickerProps) {
  const { t } = useTranslation();
  const accountOption = useAccountOption();
  return (
    <Picker
      label={label}
      groups={bySpace(spaces, accounts, t, (inSpace) => inSpace.map(accountOption))}
      value={value}
      onChange={onChange}
      placeholder={t("transactions.form.chooseAccount")}
    />
  );
}

type CategoryPickerProps = {
  categories: Category[];
  value: string | null;
  onChange: (categoryId: string) => void;
};

export function CategoryPicker({ categories, value, onChange }: CategoryPickerProps) {
  const { t } = useTranslation();
  return (
    <Picker
      label={t("transactions.form.category")}
      groups={[{ heading: null, options: categoryOptions(categories) }]}
      value={value}
      onChange={onChange}
      placeholder={t("transactions.form.chooseCategory")}
    />
  );
}
