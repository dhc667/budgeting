import { useTranslation } from "react-i18next";
import { accountsInSpaces, useAccounts } from "../accounts/account-queries";
import { useCounterparties } from "../counterparties/counterparty-queries";
import { openBalances } from "../counterparties/owed";
import type { Counterparty } from "../counterparties/read-counterparties";
import { useFormat } from "../format/use-format";
import { useCurrencies } from "../money/currency-queries";
import { useMoney } from "../money/use-money";
import { useProfile } from "../profile/profile-queries";
import { useLatestRates } from "../rates/rate-queries";
import { netWorth, type NetWorthAccount } from "../rates/net-worth";
import { StaleRateNotes } from "../rates/StaleRateNotes";
import { useShownSpaces } from "../spaces/space-picker";
import type { Space } from "../spaces/space-queries";
import { Card } from "../ui/Card";

export function NetWorthCard() {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useMoney();
  const { data: profile } = useProfile();
  const { data: currencies } = useCurrencies();
  const { data: accounts } = useAccounts();
  const { data: counterparties } = useCounterparties();
  const { data: rates } = useLatestRates();
  const shownSpaces = useShownSpaces();
  const displayCurrency = currencies?.find(({ code }) => code === profile?.display_currency);

  const shownAccounts = accounts && shownSpaces ? accountsInSpaces(accounts, shownSpaces) : [];
  const debts = counterparties && shownSpaces ? openDebtsInSpaces(counterparties, shownSpaces) : [];
  const worth =
    currencies && displayCurrency && accounts && rates && shownSpaces
      ? netWorth(shownAccounts, currencies, displayCurrency, rates)
      : null;
  // What the space owes counts against it, and what it's owed counts for it, like any balance.
  const afterDebts =
    currencies && displayCurrency && accounts && rates && debts.length > 0
      ? netWorth([...shownAccounts, ...debts], currencies, displayCurrency, rates)
      : null;
  const counted = afterDebts ?? worth;

  return (
    <Card title={t("dashboard.netWorth")}>
      <p className="text-3xl font-semibold tabular-nums">
        {worth && displayCurrency && format.money(worth.total, displayCurrency)}
      </p>
      {afterDebts && displayCurrency && (
        <p className="text-zinc-500 tabular-nums">
          {t("dashboard.netWorthAfterDebts", {
            amount: format.money(afterDebts.total, displayCurrency),
          })}
        </p>
      )}
      {counted && counted.withoutRate.length > 0 && (
        <div className="text-sm text-zinc-500">
          <p>{t("dashboard.netWorthNoRate")}</p>
          <ul>
            {counted.withoutRate.map((account) => (
              <li key={`${account.name} ${account.currency}`}>
                {account.name}: {money(account.balance, account.currency)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <StaleRateNotes rates={counted?.staleRates ?? []} />
    </Card>
  );
}

function openDebtsInSpaces(
  counterparties: Counterparty[],
  spaces: Pick<Space, "id">[],
): NetWorthAccount[] {
  return counterparties
    .filter(({ space_id }) => spaces.some(({ id }) => id === space_id))
    .flatMap(({ name, balances }) =>
      openBalances(balances).map(({ currency, owed }) => ({ name, currency, balance: owed })),
    );
}
