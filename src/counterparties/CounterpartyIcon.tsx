import { HandCoins } from "lucide-react";
import { type Color, swatchClass } from "../colors/colors";

export function CounterpartyIcon({ color }: { color: Color }) {
  return (
    <span
      aria-hidden
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white ${swatchClass[color]}`}
    >
      <HandCoins className="size-4" />
    </span>
  );
}
