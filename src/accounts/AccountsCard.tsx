import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useFormat } from "../format/use-format";
import { useCurrencies, useDisplayCurrency } from "../money/currency-queries";
import { useMoney } from "../money/use-money";
import { useLatestRates } from "../rates/rate-queries";
import { quote } from "../rates/quote";
import { inSpaces, spaceName } from "../spaces/space";
import { useShownSpaces } from "../spaces/space-picker";
import type { Space } from "../spaces/space-queries";
import { Button } from "../ui/Button";
import { Card, EmptyState } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { type Account, useAccounts, useReorderAccounts } from "./account-queries";
import { ColorDot } from "../colors/ColorDot";

export function AccountsCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data: accounts } = useAccounts();
  const shownSpaces = useShownSpaces();
  const [editingOrder, setEditingOrder] = useState(false);
  if (!accounts || !shownSpaces) return null;

  const groups = shownSpaces
    .map((space) => ({
      space,
      accounts: accounts.filter(({ space_id, archived }) => space_id === space.id && !archived),
    }))
    .filter((group) => group.accounts.length > 0);
  const archived = inSpaces(accounts, shownSpaces).filter(({ archived }) => archived);

  return (
    <Card
      title={t("dashboard.accounts")}
      className={className}
      action={
        groups.length > 0 && (
          <button
            type="button"
            onClick={() => setEditingOrder(!editingOrder)}
            className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            {editingOrder ? t("accounts.doneOrdering") : t("accounts.editOrder")}
          </button>
        )
      }
    >
      {groups.length === 0 && (
        <EmptyState>
          {accounts.length === 0 ? t("accounts.none") : t("accounts.noneShown")}
        </EmptyState>
      )}
      {groups.map(({ space, accounts }) => (
        <AccountGroup
          key={space.id}
          space={space}
          accounts={accounts}
          showHeading={shownSpaces.length > 1}
          editingOrder={editingOrder}
        />
      ))}
      {archived.length > 0 && <ArchivedAccounts accounts={archived} />}
      <Link
        to="/accounts/new"
        className="flex h-11 items-center gap-2 self-start font-medium text-emerald-700 dark:text-emerald-400"
      >
        <Plus className="size-5" />
        {t("accounts.add")}
      </Link>
    </Card>
  );
}

type AccountGroupProps = {
  space: Space;
  accounts: Account[];
  showHeading: boolean;
  editingOrder: boolean;
};

function AccountGroup({ space, accounts, showHeading, editingOrder }: AccountGroupProps) {
  const { t } = useTranslation();
  const reorder = useReorderAccounts();
  const move = (from: number, to: number) => {
    const ids = accounts.map(({ id }) => id);
    const [moved] = ids.splice(from, 1);
    if (moved) ids.splice(to, 0, moved);
    reorder.mutate(ids);
  };

  return (
    <section className="flex flex-col">
      {showHeading && (
        <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          {spaceName(space, t)}
        </h3>
      )}
      <ul className="-mx-2 flex flex-col">
        {accounts.map((account, index) => (
          <li key={account.id}>
            {editingOrder ? (
              <div className="flex min-h-11 items-center gap-3 px-2">
                <AccountSummary account={account} />
                <Button
                  variant="secondary"
                  aria-label={t("accounts.moveUp", { name: account.name })}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, index - 1)}
                  className="px-3"
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  aria-label={t("accounts.moveDown", { name: account.name })}
                  disabled={index === accounts.length - 1 || reorder.isPending}
                  onClick={() => move(index, index + 1)}
                  className="px-3"
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
            ) : (
              <AccountLink account={account} />
            )}
          </li>
        ))}
      </ul>
      {reorder.error && <ErrorText>{t("accounts.errors.saveFailed")}</ErrorText>}
    </section>
  );
}

function ArchivedAccounts({ accounts }: { accounts: Account[] }) {
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
        {t("accounts.archivedSection", { count: accounts.length })}
      </button>
      {expanded && (
        <ul className="-mx-2 flex flex-col opacity-60">
          {accounts.map((account) => (
            <li key={account.id}>
              <AccountLink account={account} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountLink({ account }: { account: Account }) {
  return (
    <Link
      to={`/accounts/${account.id}`}
      className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <AccountSummary account={account} />
    </Link>
  );
}

function AccountSummary({ account }: { account: Account }) {
  const money = useMoney();
  return (
    <>
      <ColorDot color={account.color} />
      <span className="flex-1 truncate">{account.name}</span>
      <span className="flex flex-col items-end">
        <span className="font-medium tabular-nums">{money(account.balance, account.currency)}</span>
        <RateToDisplayCurrency currency={account.currency} />
      </span>
    </>
  );
}

function RateToDisplayCurrency({ currency }: { currency: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: currencies } = useCurrencies();
  const { data: rates } = useLatestRates();
  const display = useDisplayCurrency();
  const own = currencies?.find(({ code }) => code === currency);
  if (!own || !display || !rates || own.code === display.code) return null;
  const rate = quote(own, display, rates);
  if (!rate) return null;

  const shown = { one: format.rate(1, rate.from), rate: format.rate(rate.rate, rate.to) };
  return (
    <span className="text-xs text-zinc-500 tabular-nums">
      {rate.staleSince === null
        ? t("accounts.rate", shown)
        : t("accounts.staleRate", { ...shown, date: format.day(rate.staleSince) })}
    </span>
  );
}
