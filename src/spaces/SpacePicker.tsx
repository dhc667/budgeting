import type { TFunction } from "i18next";
import { ChevronDown, Layers } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useDismiss } from "../ui/use-dismiss";
import { spaceName } from "./space";
import { useHiddenSpaces, useShownSpaces } from "./space-picker";
import { type Space, useSpaces } from "./space-queries";

export function SpacePicker() {
  const { t } = useTranslation();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const { data: spaces = [] } = useSpaces();
  const [hidden, setHidden] = useHiddenSpaces();
  const shown = useShownSpaces() ?? [];
  useDismiss(open, picker, () => setOpen(false));

  const toggle = (spaceId: string, show: boolean) =>
    setHidden(show ? hidden.filter((id) => id !== spaceId) : [...hidden, spaceId]);

  return (
    <div ref={picker} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="flex h-11 max-w-56 items-center gap-2 rounded-lg px-3 font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <Layers className="size-5 shrink-0" />
        <span className="truncate">{pickerLabel(spaces, shown, t)}</span>
        <ChevronDown className="size-4 shrink-0" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-20 mt-1 flex w-64 flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg md:right-auto md:left-0 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <fieldset className="flex flex-col">
            <legend className="mb-1 text-sm font-semibold text-zinc-500">
              {t("spacePicker.legend")}
            </legend>
            {spaces.map((space) => {
              const isShown = !hidden.includes(space.id);
              return (
                <label key={space.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isShown}
                    // Showing nothing at all would only look like an empty budget.
                    disabled={isShown && shown.length === 1}
                    onChange={(event) => toggle(space.id, event.target.checked)}
                    className="size-5"
                  />
                  <span className="truncate">{spaceName(space, t)}</span>
                </label>
              );
            })}
          </fieldset>
          <Link
            to="/spaces"
            onClick={() => setOpen(false)}
            className="border-t border-zinc-200 pt-2 font-medium text-emerald-700 dark:border-zinc-800 dark:text-emerald-400"
          >
            {t("spacePicker.manage")}
          </Link>
        </div>
      )}
    </div>
  );
}

function pickerLabel(spaces: Space[], shown: Space[], t: TFunction): string {
  const [only] = shown;
  if (shown.length === spaces.length) return t("spacePicker.all");
  if (shown.length === 1 && only) return spaceName(only, t);
  return t("spacePicker.some", { count: shown.length });
}
