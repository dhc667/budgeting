import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { AccountsCard } from "../accounts/AccountsCard";
import { useProfile } from "../profile/profile-queries";
import { UpcomingCard } from "../recurring/UpcomingCard";
import { NetWorthCard } from "./NetWorthCard";
import { RecentTransactionsCard } from "../transactions/RecentTransactionsCard";
import { Card, EmptyState } from "../ui/Card";

// Layout draft: a card showing placeholder text stands in for a feature that doesn't exist yet.
export function DashboardScreen() {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  if (!profile) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{greeting(t, profile.display_name)}</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <NetWorthCard />

        <AccountsCard className="lg:col-span-2" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:order-last">
          <UpcomingCard />
          <Card title={t("dashboard.budgets")}>
            <EmptyState>{t("dashboard.budgetsPlaceholder")}</EmptyState>
          </Card>
        </div>

        <RecentTransactionsCard className="lg:col-span-2" />
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
