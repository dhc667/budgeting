import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

// Up to the screen this one sits under, not back through history, so it still leads somewhere when
// the screen was opened from a link or the installed app reopened on it.
export function BackLink({ to, place }: { to: string; place: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={to}
      aria-label={t("nav.backTo", { place })}
      className="-ml-1.5 flex min-h-11 items-center gap-0.5 self-start text-sm font-medium text-emerald-700 dark:text-emerald-400"
    >
      <ChevronLeft aria-hidden className="size-5" />
      {place}
    </Link>
  );
}
