import { useTranslation } from "react-i18next";
import { type Color, colorName, colors, swatchClass } from "./colors";

export function ColorChoice({ defaultValue }: { defaultValue: Color }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{t("colors.label")}</legend>
      <div className="flex flex-wrap gap-1">
        {colors.map((color) => (
          <label key={color} title={colorName(color, t)} className="cursor-pointer p-1">
            <input
              type="radio"
              name="color"
              value={color}
              defaultChecked={color === defaultValue}
              className="peer sr-only"
            />
            <span
              className={`block size-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-zinc-900 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-600 dark:ring-offset-zinc-900 dark:peer-checked:ring-zinc-100 ${swatchClass[color]}`}
            />
            <span className="sr-only">{colorName(color, t)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
