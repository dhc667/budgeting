import { Calculator as CalculatorIcon } from "lucide-react";
import { type ComponentProps, lazy, Suspense, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format/use-format";
import { inputClass } from "./Field";

// Loaded only when opened, for its math library.
const Calculator = lazy(() =>
  import("./Calculator").then(({ Calculator }) => ({ default: Calculator })),
);

type AmountFieldProps = Omit<ComponentProps<"input">, "value" | "onChange"> & {
  label: string;
  hint?: string;
  value: string;
  decimals: number;
  onChange: (text: string) => void;
};

export function AmountField({
  label,
  hint,
  value,
  decimals,
  onChange,
  ...props
}: AmountFieldProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const id = useId();
  const hintId = useId();
  const [calculating, setCalculating] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative flex">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className={`${inputClass} flex-1 pr-11`}
          aria-describedby={hint ? hintId : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setCalculating(true)}
          aria-label={t("calculator.title")}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <CalculatorIcon className="size-5" />
        </button>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {calculating && (
        <Suspense>
          <Calculator
            start={format.parseAmount(value, decimals)}
            decimals={decimals}
            onUse={(minorUnits) => {
              onChange(format.amount(minorUnits, decimals));
              setCalculating(false);
            }}
            onClose={() => setCalculating(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
