import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ColorDot } from "../colors/ColorDot";
import { useMoney } from "../money/use-money";
import { useShownSpaces } from "../spaces/space-picker";
import { Card, EmptyState } from "../ui/Card";
import { useCounterparties } from "./counterparty-queries";
import { openBalances, owedClass, owedPhrase } from "./owed";
import type { Counterparty, CounterpartyBalance } from "./read-counterparties";

export function DebtsCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data: counterparties } = useCounterparties();
  const shownSpaces = useShownSpaces();
  if (!counterparties || !shownSpaces) return null;
  const shown = counterparties.filter(({ space_id }) =>
    shownSpaces.some(({ id }) => id === space_id),
  );
  const owing = shown.filter(({ balances }) => openBalances(balances).length > 0);
  const settled = shown.filter(({ balances }) => openBalances(balances).length === 0);

  return (
    <Card title={t("counterparties.title")} className={className}>
      {owing.length === 0 && <EmptyState>{t("counterparties.none")}</EmptyState>}
      {owing.length > 0 && <CounterpartyList counterparties={owing} />}
      {settled.length > 0 && <SettledCounterparties counterparties={settled} />}
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

function SettledCounterparties({ counterparties }: { counterparties: Counterparty[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <section className="flex flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex h-11 items-center gap-2 self-start text-sm font-medium text-zinc-500"
      >
        <Chevron className="size-4" />
        {t("counterparties.settledSection", { count: counterparties.length })}
      </button>
      {expanded && <CounterpartyList counterparties={counterparties} />}
    </section>
  );
}

function CounterpartyList({ counterparties }: { counterparties: Counterparty[] }) {
  return (
    <ul className="-mx-2 flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {counterparties.map((counterparty) => (
        <li key={counterparty.id}>
          <CounterpartyLink counterparty={counterparty} />
        </li>
      ))}
    </ul>
  );
}

function CounterpartyLink({ counterparty }: { counterparty: Counterparty }) {
  const open = openBalances(counterparty.balances);
  return (
    <Link
      to={`/counterparties/${counterparty.id}`}
      className="flex min-h-11 items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <span className="flex h-6 items-center">
        <ColorDot color={counterparty.color} />
      </span>
      <span className="flex-1 truncate leading-6">{counterparty.name}</span>
      <span className="flex flex-col items-end gap-1.5 whitespace-nowrap">
        <OwedGroup balances={open.filter(({ owed }) => owed > 0)} />
        <OwedGroup balances={open.filter(({ owed }) => owed < 0)} />
      </span>
    </Link>
  );
}

function OwedGroup({ balances }: { balances: CounterpartyBalance[] }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [first] = balances;
  if (!first) return null;
  if (balances.length === 1) {
    return (
      <span className={`text-sm leading-6 font-medium ${owedClass(first.owed)}`}>
        {owedPhrase(first, money, t)}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end text-sm font-medium tabular-nums">
      <span className="text-xs leading-6 font-normal text-zinc-500">
        {first.owed > 0 ? t("counterparties.owesYouLabel") : t("counterparties.youOweLabel")}
      </span>
      {balances.map(({ owed, currency }) => (
        <span key={currency} className={owedClass(owed)}>
          {money(Math.abs(owed), currency)}
        </span>
      ))}
    </span>
  );
}
