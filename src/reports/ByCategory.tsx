import { ChevronsDownUp, ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { CategoryIcon } from "../categories/CategoryIcon";
import { useCategories } from "../categories/category-queries";
import { type DateRange, localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { spaceName } from "../spaces/space";
import { TransactionList } from "../transactions/TransactionList";
import { Button } from "../ui/Button";
import { Card, EmptyState } from "../ui/Card";
import { DateField } from "../ui/DateField";
import { CategoryPie } from "./CategoryPie";
import { allTime, lastMonth, thisMonth, thisYear } from "./periods";
import type { CategoryFlow } from "./read-reports";
import type { CategoryAmount, CategoryReport, CategoryTotal } from "./report-math";
import type { ReportData } from "./report-queries";
import { useSubcategoriesShown } from "./subcategories-shown";
import { Unconverted } from "./Unconverted";

export type FlowKind = CategoryFlow["kind"];

// After Cashew's: choosing a category, on the pie or in the list, leaves only it in the list and
// shows its transactions over the period.
export function ByCategory({
  report,
  kind,
  onKindChange,
  period,
  onPeriodChange,
  data,
}: {
  report: CategoryReport;
  kind: FlowKind;
  onKindChange: (kind: FlowKind) => void;
  period: DateRange;
  onPeriodChange: (period: DateRange) => void;
  data: ReportData;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [bySubcategory, setBySubcategory] = useSubcategoriesShown();
  const chosen = findChosen(report.categories, chosenId);
  const choose = (id: string) => setChosenId((current) => (current === id ? null : id));

  function changeKind(next: FlowKind) {
    setChosenId(null);
    onKindChange(next);
  }

  return (
    <Card title={t("reports.byCategory.title")}>
      <PeriodChoice period={period} onChange={onPeriodChange} today={localToday()} />
      <KindChoice kind={kind} onChange={changeKind} />
      {report.categories.length === 0 ? (
        <EmptyState>{noneText(kind, t)}</EmptyState>
      ) : (
        <>
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-zinc-500">{totalText(kind, t)}</span>
            <span className="text-2xl font-semibold tabular-nums">
              {format.money(report.total, data.conversion.currency)}
            </span>
          </p>
          <CategoryPie
            slices={bySubcategory ? report.subcategorySlices : report.categories}
            chosen={chosenSlice(chosen, bySubcategory)}
            onChoose={choose}
          />
          <PieOptions
            onClear={chosen && (() => setChosenId(null))}
            bySubcategory={
              report.categories.some(({ subcategories }) => subcategories.length > 0)
                ? { shown: bySubcategory, onChange: setBySubcategory }
                : null
            }
          />
          <CategoryList
            categories={chosen ? [chosen.category] : report.categories}
            expanded={bySubcategory || chosen !== null}
            chosenId={chosenId}
            onChoose={choose}
            data={data}
          />
          {chosen && <ChosenTransactions chosen={chosen} period={period} />}
        </>
      )}
      <Unconverted missing={report.missing} />
    </Card>
  );
}

type Chosen = { category: CategoryTotal; subcategory: CategoryAmount | null };

function findChosen(categories: readonly CategoryTotal[], id: string | null): Chosen | null {
  for (const category of categories) {
    if (category.id === id) return { category, subcategory: null };
    const subcategory = category.subcategories.find((subcategory) => subcategory.id === id);
    if (subcategory) return { category, subcategory };
  }
  return null;
}

// Sliced by category, a chosen subcategory pulls out its category's slice.
function chosenSlice(chosen: Chosen | null, bySubcategory: boolean): string | null {
  if (!chosen) return null;
  return (bySubcategory && chosen.subcategory ? chosen.subcategory : chosen.category).id;
}

function KindChoice({ kind, onChange }: { kind: FlowKind; onChange: (kind: FlowKind) => void }) {
  const { t } = useTranslation();
  const kinds: FlowKind[] = ["expense", "income"];

  return (
    <div
      role="tablist"
      aria-label={t("reports.byCategory.kind")}
      className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800"
    >
      {kinds.map((each) => (
        <button
          key={each}
          type="button"
          role="tab"
          aria-selected={each === kind}
          onClick={() => onChange(each)}
          className="h-10 rounded-lg font-medium text-zinc-600 aria-selected:bg-white aria-selected:text-zinc-900 aria-selected:shadow-sm dark:text-zinc-400 dark:aria-selected:bg-zinc-900 dark:aria-selected:text-zinc-100"
        >
          {kindName(each, t)}
        </button>
      ))}
    </div>
  );
}

function PieOptions({
  onClear,
  bySubcategory,
}: {
  onClear: (() => void) | null;
  bySubcategory: { shown: boolean; onChange: (shown: boolean) => void } | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="-my-2 flex justify-between">
      {onClear ? (
        <button
          type="button"
          aria-label={t("reports.byCategory.clear")}
          className={iconButton}
          onClick={onClear}
        >
          <X aria-hidden className="size-5" />
        </button>
      ) : (
        <span />
      )}
      {bySubcategory && (
        <button
          type="button"
          aria-label={t("reports.byCategory.subcategories")}
          aria-pressed={bySubcategory.shown}
          className={iconButton}
          onClick={() => bySubcategory.onChange(!bySubcategory.shown)}
        >
          {bySubcategory.shown ? (
            <ChevronsDownUp aria-hidden className="size-5" />
          ) : (
            <ChevronsUpDown aria-hidden className="size-5" />
          )}
        </button>
      )}
    </div>
  );
}

function CategoryList({
  categories,
  expanded,
  chosenId,
  onChoose,
  data,
}: {
  categories: readonly CategoryTotal[];
  expanded: boolean;
  chosenId: string | null;
  onChoose: (id: string) => void;
  data: ReportData;
}) {
  const { t } = useTranslation();
  const showSpace = data.spaces.length > 1;
  const row = (amount: CategoryAmount, note?: string) => (
    <CategoryRow
      amount={amount}
      note={note}
      chosen={amount.id === chosenId}
      onChoose={() => onChoose(amount.id)}
      data={data}
    />
  );

  return (
    <ul className="-mx-2 flex flex-col gap-1">
      {categories.map((category) => {
        const space = data.spaces.find(({ id }) => id === category.spaceId);
        return (
          <li key={category.id}>
            {row(category, showSpace && space ? spaceName(space, t) : undefined)}
            {expanded && category.subcategories.length > 0 && (
              <ul className="ml-6 flex flex-col gap-1 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                {category.subcategories.map((subcategory) => (
                  <li key={subcategory.id}>{row(subcategory)}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CategoryRow({
  amount,
  note,
  chosen,
  onChoose,
  data,
}: {
  amount: CategoryAmount;
  note: string | undefined;
  chosen: boolean;
  onChoose: () => void;
  data: ReportData;
}) {
  const format = useFormat();

  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onChoose}
      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-zinc-100 aria-pressed:bg-zinc-100 dark:hover:bg-zinc-800 dark:aria-pressed:bg-zinc-800"
    >
      <CategoryIcon icon={amount.icon} color={amount.color} />
      <span className="min-w-0 flex-1 truncate">
        {amount.name}
        {note && <span className="ml-2 text-xs text-zinc-500">{note}</span>}
      </span>
      <span className="shrink-0 tabular-nums">
        <span>{format.money(amount.amount, data.conversion.currency)}</span>
        <span className="ml-2 text-xs text-zinc-500">{format.percent(amount.share)}</span>
      </span>
    </button>
  );
}

// A whole category's transactions take in its subcategories', those that spent nothing included.
function ChosenTransactions({ chosen, period }: { chosen: Chosen; period: DateRange }) {
  const { t } = useTranslation();
  const { data: categories } = useCategories();
  if (!categories) return null;
  const categoryIds = chosen.subcategory
    ? [chosen.subcategory.id]
    : [
        chosen.category.id,
        ...categories
          .filter(({ parent_id }) => parent_id === chosen.category.id)
          .map(({ id }) => id),
      ];

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
        {t("reports.byCategory.transactions")}
      </h3>
      <TransactionList
        filter={{ categoryIds, from: period.from || undefined, to: period.to || undefined }}
      />
    </section>
  );
}

function PeriodChoice({
  period,
  onChange,
  today,
}: {
  period: DateRange;
  onChange: (period: DateRange) => void;
  today: string;
}) {
  const { t } = useTranslation();
  const quick = [
    { name: t("reports.byCategory.thisMonth"), period: thisMonth(today) },
    { name: t("reports.byCategory.lastMonth"), period: lastMonth(today) },
    { name: t("reports.byCategory.thisYear"), period: thisYear(today) },
    { name: t("reports.byCategory.allTime"), period: allTime },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <DateField
          label={t("reports.byCategory.from")}
          value={period.from}
          onChange={(event) => onChange({ ...period, from: event.target.value })}
        />
        <DateField
          label={t("reports.byCategory.to")}
          value={period.to}
          onChange={(event) => onChange({ ...period, to: event.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {quick.map((choice) => (
          <Button
            key={choice.name}
            variant="secondary"
            aria-pressed={choice.period.from === period.from && choice.period.to === period.to}
            className="h-9 px-3 text-sm aria-pressed:border-emerald-600 aria-pressed:text-emerald-700 dark:aria-pressed:border-emerald-500 dark:aria-pressed:text-emerald-400"
            onClick={() => onChange(choice.period)}
          >
            {choice.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

function kindName(kind: FlowKind, t: TFunction): string {
  switch (kind) {
    case "expense":
      return t("reports.byCategory.expense");
    case "income":
      return t("reports.byCategory.income");
  }
}

function totalText(kind: FlowKind, t: TFunction): string {
  switch (kind) {
    case "expense":
      return t("reports.byCategory.totalSpent");
    case "income":
      return t("reports.byCategory.totalEarned");
  }
}

function noneText(kind: FlowKind, t: TFunction): string {
  switch (kind) {
    case "expense":
      return t("reports.byCategory.noSpending");
    case "income":
      return t("reports.byCategory.noIncome");
  }
}

const iconButton =
  "flex size-10 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 aria-pressed:text-emerald-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:aria-pressed:text-emerald-400";
