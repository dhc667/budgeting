import { type ComponentProps, useId } from "react";

type FieldProps = ComponentProps<"input"> & { label: string; hint?: string };

export function Field({ label, hint, ...props }: FieldProps) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        aria-describedby={hint ? hintId : undefined}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900";
