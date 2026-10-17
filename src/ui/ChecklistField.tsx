import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { inputClass } from "./Field";
import type { PickerGroup, PickerOption } from "./Picker";
import { useDismiss } from "./use-dismiss";

type ChecklistFieldProps = {
  label: string;
  groups: PickerGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
  // What the field says closed with none chosen, and with several.
  none: string;
  several: (count: number) => string;
};

// The Picker's options with a checkbox each, for choosing any number of them.
export function ChecklistField({
  label,
  groups,
  value,
  onChange,
  none,
  several,
}: ChecklistFieldProps) {
  const labelId = useId();
  const summaryId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  useDismiss(open, field, () => setOpen(false));
  const chosen = groups.flatMap(({ options }) => options).filter(({ id }) => value.includes(id));
  const [only] = chosen;
  const lone = chosen.length === 1 ? only : undefined;
  const summary = lone?.label ?? (chosen.length === 0 ? none : several(chosen.length));

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...value, id] : value.filter((each) => each !== id));

  const renderOption = (option: PickerOption) => (
    <label
      key={option.id}
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${option.indent ? "pl-8" : ""}`}
    >
      <input
        type="checkbox"
        aria-label={option.label}
        checked={value.includes(option.id)}
        onChange={(event) => toggle(option.id, event.target.checked)}
        className="size-5 shrink-0"
      />
      {option.content}
    </label>
  );

  return (
    <div ref={field} className="relative flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <button
        type="button"
        aria-labelledby={`${labelId} ${summaryId}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={`${inputClass} flex items-center gap-3 text-left`}
      >
        <span id={summaryId} className="sr-only">
          {summary}
        </span>
        <span aria-hidden className="flex min-w-0 flex-1 items-center gap-3">
          {lone ? (
            lone.content
          ) : (
            <span className={`truncate ${chosen.length === 0 ? "text-zinc-500" : ""}`}>
              {summary}
            </span>
          )}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-zinc-500" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full z-20 mt-1 flex max-h-80 w-full flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          {groups.map(({ heading, options }, index) =>
            heading === null ? (
              options.map(renderOption)
            ) : (
              <fieldset key={index}>
                <legend className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  {heading}
                </legend>
                {options.map(renderOption)}
              </fieldset>
            ),
          )}
        </div>
      )}
    </div>
  );
}
