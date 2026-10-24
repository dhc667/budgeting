import { type ComponentProps, useId } from "react";
import { describedBy } from "./described-by";
import { ErrorText } from "./ErrorText";
import { inputClass } from "./Field";

type SelectFieldProps = ComponentProps<"select"> & {
  label: string;
  hint?: string;
  error?: string;
};

export function SelectField({ label, hint, error, ...props }: SelectFieldProps) {
  const id = useId();
  const hintId = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        className={inputClass}
        aria-describedby={describedBy(hint && hintId, error && errorId)}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}
