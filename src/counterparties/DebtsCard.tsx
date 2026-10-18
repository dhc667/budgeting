import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ColorDot } from "../colors/ColorDot";
import { useMoney } from "../money/use-money";
import { useShownSpaces } from "../spaces/space-picker";
import { Card, EmptyState } from "../ui/Card";
import { useCounterparties } from "./counterparty-queries";
import { owedClass, owedSummary } from "./owed";
import type { Counterparty } from "./read-counterparties";

export function DebtsCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data: counterparties } = useCounterparties();
  const shownSpaces = useShownSpaces();
  if (!counterparties || !shownSpaces) return null;
  const shown = counterparties.filter(({ space_id }) =>
    shownSpaces.some(({ id }) => id === space_id),
  );

  return (
    <Card title={t("counterparties.title")} className={className}>
      {shown.length === 0 && <EmptyState>{t("counterparties.none")}</EmptyState>}
      {shown.length > 0 && (
        <ul className="-mx-2 flex flex-col">
          {shown.map((counterparty) => (
            <li key={counterparty.id}>
              <CounterpartyLink counterparty={counterparty} />
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/counterparties/new"
        className="flex h-11 items-center gap-2 self-start font-medium text-emerald-700 dark:text-emerald-400"
      >
        <Plus className="size-5" />
        {t("counterparties.add")}
      </Link>
    </Card>
  );
}

function CounterpartyLink({ counterparty }: { counterparty: Counterparty }) {
  const { t } = useTranslation();
  const money = useMoney();
  return (
    <Link
      to={`/counterparties/${counterparty.id}`}
      className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <ColorDot color={counterparty.color} />
      <span className="flex-1 truncate">{counterparty.name}</span>
      <span className={`text-right text-sm font-medium ${owedClass(counterparty.balances)}`}>
        {owedSummary(counterparty.balances, money, t)}
      </span>
    </Link>
  );
}
