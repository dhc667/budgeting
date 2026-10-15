import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../ui/Card";

export function ComingSoonScreen({ title }: { title: (t: TFunction) => string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{title(t)}</h1>
      <EmptyState>{t("comingSoon")}</EmptyState>
    </div>
  );
}
