import { formatMoney } from "../money/format";
import { useProfile } from "../profile/profile-queries";
import { Card, EmptyState } from "../ui/Card";

// Layout draft: every card is a placeholder for a feature that doesn't exist yet.
export function DashboardScreen() {
  const { data: profile } = useProfile();
  if (!profile) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {greeting()}, {profile.display_name}
      </h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Net worth">
          <p className="text-3xl font-semibold tabular-nums">
            {formatMoney(0, profile.display_currency)}
          </p>
          <EmptyState>The all-time net worth chart goes here.</EmptyState>
        </Card>

        <Card title="Accounts" className="lg:col-span-2">
          <EmptyState>Your accounts and their balances go here.</EmptyState>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:order-last">
          <Card title="Upcoming">
            <EmptyState>Recurring transactions waiting to be paid go here.</EmptyState>
          </Card>
          <Card title="Budgets">
            <EmptyState>Budget progress goes here.</EmptyState>
          </Card>
        </div>

        <Card title="Recent transactions" className="lg:col-span-2">
          <EmptyState>Your latest transactions go here.</EmptyState>
        </Card>
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
