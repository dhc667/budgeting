import { Check, ChevronDown } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { inputClass } from "./Field";
import { useDismiss } from "./use-dismiss";

type PickerProps = {
  label: string;
  groups: PickerGroup[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder: string;
};

// A select whose options show more than text, following the select-only combobox of the ARIA
// Authoring Practices: a native select can't hold an icon.
export function Picker({ label, groups, value, onChange, placeholder }: PickerProps) {
  const buttonId = useId();
  const labelId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const picker = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const options = groups.flatMap((group) => group.options);
  const selected = options.find((option) => option.id === value);
  const elementId = (optionId: string) => `${listId}-${optionId}`;
  useDismiss(open, picker, () => setOpen(false));

  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);
  useEffect(() => {
    if (activeId === null) return;
    // jsdom has no scrolling.
    document.getElementById(`${listId}-${activeId}`)?.scrollIntoView?.({ block: "nearest" });
  }, [listId, activeId]);

  const show = () => {
    setActiveId(selected?.id ?? options[0]?.id ?? null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (optionId: string) => {
    onChange(optionId);
    close();
  };

  const onListKeyDown = (event: KeyboardEvent) => {
    const index = options.findIndex(({ id }) => id === activeId);
    const moveTo = (to: number) => {
      const option = options[Math.max(0, Math.min(options.length - 1, to))];
      if (option) setActiveId(option.id);
    };
    switch (event.key) {
      case "ArrowDown":
        moveTo(index + 1);
        break;
      case "ArrowUp":
        moveTo(index - 1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(options.length - 1);
        break;
      case "Enter":
      case " ":
        if (activeId !== null) choose(activeId);
        break;
      case "Escape":
        close();
        break;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  const renderOption = (option: PickerOption) => (
    <div
      key={option.id}
      id={elementId(option.id)}
      role="option"
      aria-selected={option.id === value}
      aria-label={option.label}
      onClick={() => choose(option.id)}
      onPointerMove={() => setActiveId(option.id)}
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 ${option.indent ? "pl-8" : ""} ${option.id === activeId ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
    >
      {option.content}
      {option.id === value && <Check className="size-4 shrink-0 text-emerald-600" />}
    </div>
  );

  return (
    <div ref={picker} className="relative flex flex-col gap-1.5">
      <label id={labelId} htmlFor={buttonId} className="text-sm font-medium">
        {label}
      </label>
      <button
        ref={button}
        id={buttonId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          show();
        }}
        className={`${inputClass} flex items-center gap-3 text-left`}
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 items-center gap-3">{selected.content}</span>
        ) : (
          <span className="flex-1 truncate text-zinc-500">{placeholder}</span>
        )}
        <ChevronDown className="size-4 shrink-0 text-zinc-500" />
      </button>
      {open && (
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          aria-activedescendant={activeId === null ? undefined : elementId(activeId)}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="absolute top-full z-20 mt-1 flex max-h-80 w-full flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg outline-none dark:border-zinc-800 dark:bg-zinc-900"
        >
          {groups.map(({ heading, options }, index) =>
            heading === null ? (
              options.map(renderOption)
            ) : (
              <div key={index} role="group" aria-labelledby={`${listId}-group-${index}`}>
                <div
                  id={`${listId}-group-${index}`}
                  className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase"
                >
                  {heading}
                </div>
                {options.map(renderOption)}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

type PickerGroup = { heading: string | null; options: PickerOption[] };

// `label` names the option to assistive technology, so it can say more than `content` shows.
export type PickerOption = { id: string; label: string; content: ReactNode; indent?: boolean };
