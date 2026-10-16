import { createElement } from "react";
import { type Color, swatchClass } from "../colors/colors";
import { iconFor } from "./icons";

export function CategoryIcon({ icon, color }: { icon: string; color: Color }) {
  return (
    <span
      aria-hidden
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white ${swatchClass[color]}`}
    >
      {createElement(iconFor(icon), { className: "size-4" })}
    </span>
  );
}
