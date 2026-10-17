import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useAccounts } from "../accounts/account-queries";
import { useCategories } from "../categories/category-queries";
import { useShownSpaces } from "../spaces/space-picker";
import { inputClass } from "../ui/Field";
import { useDebounced } from "../ui/use-debounced";
import { activeCount, inPlay, transactionFilter, useListFilters } from "./list-filters";
import { TransactionFilters } from "./TransactionFilters";
import { TransactionList } from "./TransactionList";

export function TransactionsScreen() {
  const { t } = useTranslation();
  const shownSpaces = useShownSpaces();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { values, change, clear } = useListFilters();
  const search = useDebounced(values.search);
  if (!shownSpaces || !accounts || !categories) return null;
  const choices = { shownSpaces, accounts, categories };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("nav.transactions")}</h1>
        <Link
          to="/transactions/new"
          className="flex h-11 items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400"
        >
          <Plus className="size-5" />
          {t("nav.addTransaction")}
        </Link>
      </header>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-3 left-3 size-5 text-zinc-400" />
          <input
            type="search"
            aria-label={t("transactions.search.label")}
            placeholder={t("transactions.search.placeholder")}
            value={values.search}
            onChange={(event) => change({ search: event.target.value })}
            className={`${inputClass} w-full pl-10`}
          />
        </div>
        <TransactionFilters
          values={values}
          change={change}
          clear={clear}
          shownSpaces={shownSpaces}
          {...inPlay(values, choices)}
        />
      </div>
      <TransactionList
        filter={transactionFilter(values, choices, search)}
        empty={values.search || activeCount(values) > 0 ? t("transactions.noMatches") : undefined}
      />
    </div>
  );
}
