import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useShownSpaces } from "../spaces/space-picker";
import { Card } from "../ui/Card";
import { shownBudgets, useBudgets } from "./budget-queries";
import { BudgetSummary } from "./BudgetSummary";

// One budget at a time, swiped through. Absent while the shown spaces have no budgets, so that the
// dashboard holds only what's in use.
export function BudgetsCarousel() {
  const { t } = useTranslation();
  const { data: budgets } = useBudgets();
  const shownSpaces = useShownSpaces();
  const track = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);
  const shown = shownBudgets(budgets, shownSpaces) ?? [];
  if (shown.length === 0) return null;

  const onScroll = () => {
    const { scrollLeft, clientWidth } = track.current ?? { scrollLeft: 0, clientWidth: 1 };
    setCurrent(Math.round(scrollLeft / clientWidth));
  };
  const show = (index: number) => {
    const slide = track.current?.children[index];
    // jsdom has no scrolling.
    slide?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "start" });
    setCurrent(index);
  };

  return (
    <Card
      title={t("dashboard.budgets")}
      action={
        <Link to="/budgets" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {t("dashboard.allBudgets")}
        </Link>
      }
    >
      <ul
        ref={track}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
      >
        {shown.map((budget) => (
          <li key={budget.id} className="w-full shrink-0 snap-start px-4">
            <Link to={`/budgets/${budget.id}`} className="flex flex-col gap-2">
              <span className="truncate font-semibold">{budget.name}</span>
              <BudgetSummary budget={budget} />
            </Link>
          </li>
        ))}
      </ul>
      {shown.length > 1 && (
        <div className="flex justify-center gap-1">
          {shown.map((budget, index) => (
            <button
              key={budget.id}
              type="button"
              aria-label={t("dashboard.showBudget", { name: budget.name })}
              aria-current={index === current}
              onClick={() => show(index)}
              className="flex size-6 items-center justify-center"
            >
              <span
                className={`size-2 rounded-full ${index === current ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
              />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
