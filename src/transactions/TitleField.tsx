import { type KeyboardEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccounts } from "../accounts/account-queries";
import { useCategories } from "../categories/category-queries";
import { useCounterparties } from "../counterparties/counterparty-queries";
import { inputClass } from "../ui/Field";
import type { TitleSuggestion } from "./transaction-queries";
import { TransactionSummary } from "./TransactionList";

type TitleFieldProps = {
  value: string;
  onChange: (title: string) => void;
  suggestions: TitleSuggestion[];
  onPick: (suggestion: TitleSuggestion) => void;
};

// Follows the list autocomplete combobox of the ARIA Authoring Practices: a datalist can only show
// the title, not what it was spent on or how much.
export function TitleField({ value, onChange, suggestions, onPick }: TitleFieldProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const listId = useId();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: counterparties = [] } = useCounterparties();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const matches = matching(value, suggestions);
  const showing = open && matches.length > 0;
  const active = activeIndex === null ? undefined : matches[activeIndex];
  const optionId = (index: number) => `${listId}-${index}`;

  const pick = (suggestion: TitleSuggestion) => {
    onPick(suggestion);
    setOpen(false);
    setActiveIndex(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        setOpen(true);
        setActiveIndex((index) => (index === null ? 0 : Math.min(matches.length - 1, index + 1)));
        break;
      case "ArrowUp":
        setActiveIndex((index) => (index === null || index === 0 ? null : index - 1));
        break;
      case "Enter":
        if (!showing || !active) return;
        pick(active);
        break;
      case "Escape":
        if (!showing) return;
        setOpen(false);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {t("transactions.form.title")}
      </label>
      <input
        id={inputId}
        name="title"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={listId}
        aria-activedescendant={showing && activeIndex !== null ? optionId(activeIndex) : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(null);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={inputClass}
      />
      {showing && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("transactions.form.pastTitles")}
          className="absolute top-full z-20 mt-1 flex w-full flex-col rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          {matches.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              // Keeps the focus in the title, whose blur would close the list before the click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(suggestion)}
              onPointerMove={() => setActiveIndex(index)}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-2 ${index === activeIndex ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
            >
              <TransactionSummary
                transaction={suggestion}
                accounts={accounts}
                categories={categories}
                counterparties={counterparties}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Newest first, as they come.
function matching(typed: string, suggestions: TitleSuggestion[]): TitleSuggestion[] {
  const wanted = typed.trim().toLowerCase();
  return suggestions
    .filter(({ title }) => title.toLowerCase().includes(wanted))
    .slice(0, shownCount);
}

const shownCount = 6;
