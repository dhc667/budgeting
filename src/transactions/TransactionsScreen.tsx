import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useShownSpaces } from "../spaces/space-picker";
import { TransactionList } from "./TransactionList";

export function TransactionsScreen() {
  const { t } = useTranslation();
  const shownSpaces = useShownSpaces();
  if (!shownSpaces) return null;

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
      <TransactionList filter={{ kind: "spaces", spaceIds: shownSpaces.map(({ id }) => id) }} />
    </div>
  );
}
