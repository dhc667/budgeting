import type { TFunction } from "i18next";
import { Constants, type Enums } from "../supabase/database.types";

export type Color = Enums<"color">;

export const colors = Constants.public.Enums.color;

// Spelled out in full so Tailwind finds every class. Each reads on white and on zinc-900 alike.
export const swatchClass: Record<Color, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  lime: "bg-lime-500",
  green: "bg-green-600",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
  slate: "bg-slate-500",
};

// The swatches' colours, for filling chart shapes, which take no class.
export const swatchFill: Record<Color, string> = {
  red: "var(--color-red-500)",
  orange: "var(--color-orange-500)",
  amber: "var(--color-amber-500)",
  lime: "var(--color-lime-500)",
  green: "var(--color-green-600)",
  teal: "var(--color-teal-500)",
  cyan: "var(--color-cyan-500)",
  blue: "var(--color-blue-500)",
  indigo: "var(--color-indigo-500)",
  violet: "var(--color-violet-500)",
  pink: "var(--color-pink-500)",
  slate: "var(--color-slate-500)",
};

export function colorName(color: Color, t: TFunction): string {
  switch (color) {
    case "red":
      return t("colors.red");
    case "orange":
      return t("colors.orange");
    case "amber":
      return t("colors.amber");
    case "lime":
      return t("colors.lime");
    case "green":
      return t("colors.green");
    case "teal":
      return t("colors.teal");
    case "cyan":
      return t("colors.cyan");
    case "blue":
      return t("colors.blue");
    case "indigo":
      return t("colors.indigo");
    case "violet":
      return t("colors.violet");
    case "pink":
      return t("colors.pink");
    case "slate":
      return t("colors.slate");
  }
}
