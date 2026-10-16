import { type Color, swatchClass } from "./colors";

export function ColorDot({ color }: { color: Color }) {
  return <span aria-hidden className={`size-3 shrink-0 rounded-full ${swatchClass[color]}`} />;
}
