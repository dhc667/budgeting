import { useTranslation } from "react-i18next";
import { accountsInSpaces, useAccounts } from "../accounts/account-queries";
import { useFormat } from "../format/use-format";
import { useCurrencies } from "../money/currency-queries";
import { useMoney } from "../money/use-money";
import { useProfile } from "../profile/profile-queries";
import { useLatestRates } from "../rates/rate-queries";
import { netWorth } from "../rates/net-worth";
import { StaleRateNotes } from "../rates/StaleRateNotes";
import { useShownSpaces } from "../spaces/space-picker";
import { Card } from "../ui/Card";

export function NetWorthCard() {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useMoney();
  const { data: profile } = useProfile();
  const { data: currencies } = useCurrencies();
  const { data: accounts } = useAccounts();
  const { data: rates } = useLatestRates();
  const shownSpaces = useShownSpaces();
  const displayCurrency = currencies?.find(({ code }) => code === profile?.display_currency);

  const worth =
    currencies && displayCurrency && accounts && rates && shownSpaces
      ? netWorth(accountsInSpaces(accounts, shownSpaces), currencies, displayCurrency, rates)
      : null;

  return (
    <Card title={t("dashboard.netWorth")}>
      <p className="text-3xl font-semibold tabular-nums">
        {worth && displayCurrency && format.money(worth.total, displayCurrency)}
      </p>
      {worth && worth.withoutRate.length > 0 && (
        <div className="text-sm text-zinc-500">
          <p>{t("dashboard.netWorthNoRate")}</p>
          <ul>
            {worth.withoutRate.map((account) => (
              <li key={account.name}>
                {account.name}: {money(account.balance, account.currency)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <StaleRateNotes rates={worth?.staleRates ?? []} />
    </Card>
  );
}
