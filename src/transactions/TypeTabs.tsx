import { useTranslation } from "react-i18next";
import { type DebtType, type Tab, tabName } from "./transaction-tabs";

type TypeTabsProps = { tabs: readonly Tab[]; value: Tab; onChange: (tab: Tab) => void };

export function TypeTabs({ tabs, value, onChange }: TypeTabsProps) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("transactions.form.type")}
      className={`grid gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800 ${columnsClass[tabs.length] ?? ""}`}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === value}
          onClick={() => onChange(tab)}
          className="h-10 rounded-lg font-medium text-zinc-600 aria-selected:bg-white aria-selected:text-zinc-900 aria-selected:shadow-sm dark:text-zinc-400 dark:aria-selected:bg-zinc-900 dark:aria-selected:text-zinc-100"
        >
          {tabName(tab, t)}
        </button>
      ))}
    </div>
  );
}

// Lent or paid back, against borrowed or got back: the same money moving either way. Forgiving
// settles what's owed without money moving; it starts on its counterparty's screen, where it can be
// split across accounts, so it's offered here only to edit one.
export function DirectionChoice({
  value,
  forgiveness,
  onChange,
}: {
  value: DebtType;
  forgiveness: boolean;
  onChange: (debt: DebtType) => void;
}) {
  const { t } = useTranslation();
  const options: { value: DebtType; label: string; hint: string }[] = forgiveness
    ? [
        {
          value: "forgave",
          label: t("transactions.form.forgave"),
          hint: t("transactions.form.forgaveHint"),
        },
        {
          value: "forgiven",
          label: t("transactions.form.forgiven"),
          hint: t("transactions.form.forgivenHint"),
        },
      ]
    : [
        {
          value: "given",
          label: t("transactions.form.given"),
          hint: t("transactions.form.givenHint"),
        },
        {
          value: "received",
          label: t("transactions.form.received"),
          hint: t("transactions.form.receivedHint"),
        },
      ];
  return (
    <div
      role="radiogroup"
      aria-label={t("transactions.form.direction")}
      className="grid grid-cols-2 gap-2"
    >
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className="flex flex-col items-start rounded-lg border border-zinc-300 p-3 text-left aria-checked:border-emerald-600 aria-checked:ring-2 aria-checked:ring-emerald-600/20 dark:border-zinc-700"
        >
          <span className="font-medium">{option.label}</span>
          <span className="text-xs text-zinc-500">{option.hint}</span>
        </button>
      ))}
    </div>
  );
}

// Spelled out in full so Tailwind finds every class.
const columnsClass: Record<number, string> = { 3: "grid-cols-3", 4: "grid-cols-4" };
