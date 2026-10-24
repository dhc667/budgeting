import type { TFunction } from "i18next";
import { Delete } from "lucide-react";
import {
  addDependencies,
  bignumberDependencies,
  create,
  divideDependencies,
  evaluateDependencies,
  type FactoryFunctionMap,
  isBigNumber,
  multiplyDependencies,
  subtractDependencies,
  unaryMinusDependencies,
} from "mathjs";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format/use-format";
import { ConfirmDialog } from "./ConfirmDialog";

type CalculatorProps = {
  // In minor units, as the expression starts. Null starts it empty.
  start: number | null;
  decimals: number;
  onUse: (minorUnits: number) => void;
  onClose: () => void;
};

export function Calculator({ start, decimals, onUse, onClose }: CalculatorProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [expression, setExpression] = useState(
    start === null ? "" : String(start / 10 ** decimals),
  );
  const result = worked(expression, decimals);

  return (
    <ConfirmDialog
      open
      title={t("calculator.title")}
      confirmLabel={t("calculator.use")}
      canConfirm={result !== null}
      pending={false}
      onConfirm={() => result !== null && onUse(result)}
      onCancel={onClose}
    >
      <div className="flex min-h-20 flex-col items-end justify-center rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
        <output className="text-2xl font-medium break-all tabular-nums">
          {shown(expression, format.decimalSeparator) || "0"}
        </output>
        {result !== null && (
          <output className="text-sm text-zinc-500 tabular-nums">
            = {format.amount(result, decimals)}
          </output>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {keypad.map((key) => (
          <KeyButton
            key={key}
            label={isDigit(key) ? undefined : labelOf(key, t)}
            onClick={() => setExpression(pressed(expression, key))}
            operator={isOperator(key)}
            wide={key === "0"}
          >
            {isDigit(key) ? key : keyText(key, format.decimalSeparator)}
          </KeyButton>
        ))}
      </div>
    </ConfirmDialog>
  );
}

type KeyButtonProps = {
  label: string | undefined;
  onClick: () => void;
  operator: boolean;
  wide: boolean;
  children: ReactNode;
};

function KeyButton({ label, onClick, operator, wide, children }: KeyButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-12 items-center justify-center rounded-lg text-xl font-medium ${
        wide ? "col-span-2" : ""
      } ${
        operator
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900"
          : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

// The expression is kept as mathjs reads it, and shown in the user's own symbols.
function pressed(expression: string, key: Key): string {
  if (isDigit(key)) return expression + key;
  const last = expression.at(-1);
  switch (key) {
    case "clear":
      return "";
    case "delete":
      return expression.slice(0, -1);
    case ".": {
      const number = expression.split(/[-+*/()]/).at(-1) ?? "";
      if (number.includes(".")) return expression;
      return expression + (number === "" ? "0." : ".");
    }
    case "(":
      return expression + key;
    case ")":
      return unclosed(expression) > 0 && last !== "(" && !isOperator(last)
        ? expression + key
        : expression;
    case "-":
      if (last === undefined || last === "(") return expression + key;
      return isOperator(last) ? expression.slice(0, -1) + key : expression + key;
    case "+":
    case "*":
    case "/":
      if (last === undefined || last === "(") return expression;
      return isOperator(last) ? expression.slice(0, -1) + key : expression + key;
  }
}

// What the expression comes to, in minor units, or null while it doesn't make sense yet.
// Parentheses still open count as closed at the end.
function worked(expression: string, decimals: number): number | null {
  if (expression === "") return null;
  try {
    const value: unknown = math.evaluate(expression + ")".repeat(unclosed(expression)));
    if (!isBigNumber(value) || !value.isFinite()) return null;
    const minorUnits = value
      .mul(10 ** decimals)
      .round()
      .toNumber();
    return Number.isSafeInteger(minorUnits) ? minorUnits : null;
  } catch {
    return null;
  }
}

function unclosed(expression: string): number {
  return expression.split("(").length - expression.split(")").length;
}

function shown(expression: string, decimalSeparator: string): string {
  return expression
    .replaceAll(".", decimalSeparator)
    .replaceAll("-", "−")
    .replaceAll("*", "×")
    .replaceAll("/", "÷");
}

function keyText(key: Exclude<Key, Digit>, decimalSeparator: string): ReactNode {
  switch (key) {
    case ".":
      return decimalSeparator;
    case "-":
      return "−";
    case "*":
      return "×";
    case "/":
      return "÷";
    case "delete":
      return <Delete className="size-5" />;
    case "clear":
      return "C";
    case "+":
    case "(":
    case ")":
      return key;
  }
}

function labelOf(key: Exclude<Key, Digit>, t: TFunction): string {
  switch (key) {
    case ".":
      return t("calculator.decimalPoint");
    case "+":
      return t("calculator.plus");
    case "-":
      return t("calculator.minus");
    case "*":
      return t("calculator.times");
    case "/":
      return t("calculator.dividedBy");
    case "(":
      return t("calculator.openParenthesis");
    case ")":
      return t("calculator.closeParenthesis");
    case "delete":
      return t("calculator.delete");
    case "clear":
      return t("calculator.clear");
  }
}

function isDigit(key: Key): key is Digit {
  return digits.some((digit) => digit === key);
}

function isOperator(character: string | undefined): boolean {
  return ["+", "-", "*", "/"].some((operator) => operator === character);
}

// Decimal arithmetic, so that 0.1 + 0.2 makes 0.3. Only what the keypad offers is loaded.
const math = create(
  [
    evaluateDependencies,
    bignumberDependencies,
    addDependencies,
    subtractDependencies,
    multiplyDependencies,
    divideDependencies,
    unaryMinusDependencies,
  ].reduce<FactoryFunctionMap>((all, dependencies) => ({ ...all, ...dependencies }), {}),
  { number: "BigNumber", precision: 64 },
);

const keypad = [
  "clear",
  "(",
  ")",
  "/",
  "7",
  "8",
  "9",
  "*",
  "4",
  "5",
  "6",
  "-",
  "1",
  "2",
  "3",
  "+",
  "0",
  ".",
  "delete",
] as const;

type Key = (typeof keypad)[number];

const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

type Digit = (typeof digits)[number];
