import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { AccountsCard } from "../accounts/AccountsCard";
import { useFormat } from "../format/use-format";
import { useCurrencies } from "../money/currency-queries";
import { useProfile } from "../profile/profile-queries";
import { Card, EmptyState } from "../ui/Card";

// Layout draft: a card showing placeholder text stands in for a feature that doesn't exist yet.
export function DashboardScreen() {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: profile } = useProfile();
  const { data: currencies } = useCurrencies();
  if (!profile) return null;
  const displayCurrency = currencies?.find(({ code }) => code === profile.display_currency);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{greeting(t, profile.display_name)}</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("dashboard.netWorth")}>
          <p className="text-3xl font-semibold tabular-nums">
            {displayCurrency && format.money(0, displayCurrency)}
          </p>
          <EmptyState>{t("dashboard.netWorthPlaceholder")}</EmptyState>
        </Card>

        <AccountsCard className="lg:col-span-2" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:order-last">
          <Card title={t("dashboard.upcoming")}>
            <EmptyState>{t("dashboard.upcomingPlaceholder")}</EmptyState>
          </Card>
          <Card title={t("dashboard.budgets")}>
            <EmptyState>{t("dashboard.budgetsPlaceholder")}</EmptyState>
          </Card>
        </div>

        <Card title={t("dashboard.recent")} className="lg:col-span-2">
          <EmptyState>{t("dashboard.recentPlaceholder")}</EmptyState>
        </Card>
      </div>
    </div>
  );
}

function greeting(t: TFunction, name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("dashboard.greeting.morning", { name });
  if (hour < 18) return t("dashboard.greeting.afternoon", { name });
  return t("dashboard.greeting.evening", { name });
}
