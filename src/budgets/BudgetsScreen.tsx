import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { spaceName } from "../spaces/space";
import { useShownSpaces } from "../spaces/space-picker";
import { type Space } from "../spaces/space-queries";
import { EmptyState } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { type Budget, shownBudgets, useBudgets } from "./budget-queries";
import { BudgetSummary } from "./BudgetSummary";

export function BudgetsScreen() {
  const { t } = useTranslation();
  const { data: budgets, error } = useBudgets();
  const shownSpaces = useShownSpaces();
  const shown = shownBudgets(budgets, shownSpaces);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("budgets.title")}</h1>
        <Link
          to="/budgets/new"
          className="flex h-11 items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400"
        >
          <Plus className="size-5" />
          {t("budgets.add")}
        </Link>
      </header>
      {error && <ErrorText>{t("budgets.errors.loadFailed")}</ErrorText>}
      {shown &&
        shownSpaces &&
        (shown.length === 0 ? (
          <EmptyState>
            {budgets?.length === 0 ? t("budgets.none") : t("budgets.noneShown")}
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {shown.map((budget) => (
              <li key={budget.id}>
                <BudgetCard budget={budget} spaces={shownSpaces} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

// The space is named once more than one shows, as budgets in different spaces may share a name.
function BudgetCard({ budget, spaces }: { budget: Budget; spaces: Space[] }) {
  const { t } = useTranslation();
  const space = spaces.find(({ id }) => id === budget.space_id);
  return (
    <Link
      to={`/budgets/${budget.id}`}
      className="flex h-full flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate font-semibold">{budget.name}</span>
        {spaces.length > 1 && space && (
          <span className="shrink-0 text-xs text-zinc-500">{spaceName(space, t)}</span>
        )}
      </span>
      <BudgetSummary budget={budget} />
    </Link>
  );
}
