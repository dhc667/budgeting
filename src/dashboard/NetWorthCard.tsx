import { useTranslation } from "react-i18next";
import { owedPhrase } from "../counterparties/owed";
import { useFormat } from "../format/use-format";
import { useMoney } from "../money/use-money";
import { StaleRateNotes } from "../rates/StaleRateNotes";
import { type NetWorthToday, useNetWorthToday } from "../rates/use-net-worth";
import { useShownSpaces } from "../spaces/space-picker";
import { Card } from "../ui/Card";

export function NetWorthCard() {
  const { t } = useTranslation();
  const format = useFormat();
  const worth = useNetWorthToday(useShownSpaces());

  return (
    <Card title={t("dashboard.netWorth")}>
      <p className="text-3xl font-semibold tabular-nums">
        {worth && format.money(worth.total, worth.currency)}
      </p>
      {worth && worth.afterDebts !== null && (
        <p className="text-zinc-500 tabular-nums">
          {t("dashboard.netWorthAfterDebts", {
            amount: format.money(worth.afterDebts, worth.currency),
          })}
        </p>
      )}
      {worth && <NotCounted worth={worth} />}
      <StaleRateNotes rates={worth?.staleRates ?? []} />
    </Card>
  );
}

function NotCounted({ worth }: { worth: NetWorthToday }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { accountsWithoutRate, debtsWithoutRate } = worth;
  if (accountsWithoutRate.length === 0 && debtsWithoutRate.length === 0) return null;

  return (
    <div className="text-sm text-zinc-500">
      <p>{t("dashboard.netWorthNoRate")}</p>
      <ul>
        {accountsWithoutRate.map(({ name, currency, balance }) => (
          <li key={`account ${name} ${currency}`}>
            {name}: {money(balance, currency)}
          </li>
        ))}
        {debtsWithoutRate.map(({ name, currency, balance }) => (
          <li key={`debt ${name} ${currency}`}>
            {name}: {owedPhrase({ owed: balance, currency }, money, t)}
          </li>
        ))}
      </ul>
    </div>
  );
}
