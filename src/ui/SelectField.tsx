import { type ComponentProps, useId } from "react";
import { inputClass } from "./Field";

type SelectFieldProps = ComponentProps<"select"> & { label: string; hint?: string };

export function SelectField({ label, hint, ...props }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} className={inputClass} {...props} />
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
