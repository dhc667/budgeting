import { useTranslation } from "react-i18next";
import type { MissingRate } from "../rates/convert-dated";

export function Unconverted({ missing }: { missing: MissingRate[] }) {
  const { t } = useTranslation();
  if (missing.length === 0) return null;
  return (
    <p className="text-xs text-zinc-500">
      {t("reports.unconverted", { currencies: missing.map(({ currency }) => currency).join(", ") })}
    </p>
  );
}
