import { type ComponentProps, useId, useState } from "react";
import { useFormat } from "../format/use-format";
import { inputClass } from "./Field";

type DateFieldProps = Omit<ComponentProps<"input">, "type"> & { label: string; hint?: string };

// A date input writes the date the device's way, whatever the user's date format. So the input is
// laid invisibly over the date as the user writes it, and tapping it still opens the device's own
// picker.
export function DateField({
  label,
  hint,
  value,
  defaultValue,
  onChange,
  ...props
}: DateFieldProps) {
  const id = useId();
  const hintId = useId();
  const format = useFormat();
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ""));
  const day = value === undefined ? uncontrolled : String(value);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="date"
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
          aria-describedby={hint ? hintId : undefined}
          value={value}
          defaultValue={defaultValue}
          onChange={(event) => {
            setUncontrolled(event.target.value);
            onChange?.(event);
          }}
          onClick={(event) => event.currentTarget.showPicker()}
          {...props}
        />
        <div
          aria-hidden
          className={`${inputClass} flex items-center peer-focus:border-emerald-600 peer-focus:ring-2 peer-focus:ring-emerald-600/20 peer-disabled:opacity-60`}
        >
          {day && format.day(day)}
        </div>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
    </div>
  );
}
