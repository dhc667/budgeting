import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { inputClass } from "./Field";
import { useDismiss } from "./use-dismiss";

type ChecklistFieldProps = {
  label: string;
  // What the field shows closed: the choices, or that there are none.
  summary: string;
  groups: ChecklistGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
};

export function ChecklistField({ label, summary, groups, value, onChange }: ChecklistFieldProps) {
  const labelId = useId();
  const summaryId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  useDismiss(open, field, () => setOpen(false));

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...value, id] : value.filter((each) => each !== id));

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
        className={`${inputClass} flex items-center justify-between gap-2 text-left`}
      >
        <span id={summaryId} className="truncate">
          {summary}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-zinc-500" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full z-20 mt-1 flex max-h-80 w-full flex-col gap-2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          {groups.map((group, index) => (
            <fieldset key={group.label ?? index} className="flex flex-col">
              {group.label && (
                <legend className="mb-1 text-sm font-semibold text-zinc-500">{group.label}</legend>
              )}
              {group.options.map((option) => (
                <label key={option.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={value.includes(option.id)}
                    onChange={(event) => toggle(option.id, event.target.checked)}
                    className="size-5"
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}

export type ChecklistGroup = { label?: string; options: { id: string; label: string }[] };
