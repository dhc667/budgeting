import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { type Account, useAccounts } from "../accounts/account-queries";
import { CategoryIcon } from "../categories/CategoryIcon";
import { type Category, useCategories } from "../categories/category-queries";
import { CounterpartyIcon } from "../counterparties/CounterpartyIcon";
import { useCounterparties } from "../counterparties/counterparty-queries";
import type { Counterparty } from "../counterparties/read-counterparties";
import { useFormat } from "../format/use-format";
import { useMoney } from "../money/use-money";
import { displayNameOf, useUsers } from "../profile/profile-queries";
import { isPrivate } from "../spaces/space";
import { useSpaces } from "../spaces/space-queries";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { openedFrom } from "./list-filters";
import type { TransactionType } from "./transaction-writes";
import { type ShownAmount, shownAmount, signedAmount, transactionLabel } from "./transaction";
import {
  type ListDay,
  type Transaction,
  type TransactionFilter,
  useDayTotals,
  useTransactions,
} from "./transaction-queries";

type TransactionListProps = { filter: TransactionFilter; empty?: string };

export function TransactionList({ filter, empty }: TransactionListProps) {
  const { t } = useTranslation();
  const { data, error, showMore } = useTransactions(filter);
  const totals = useDayTotals(data?.days);
  if (error) return <ErrorText>{t("transactions.errors.loadFailed")}</ErrorText>;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-3">
      <TransactionGroups
        transactions={data.transactions}
        accountId={seenFrom(filter)}
        empty={empty}
        days={data.days}
        totals={totals}
      />
      {data.hasMore && (
        <Button variant="secondary" onClick={showMore} className="self-start">
          {t("transactions.showMore")}
        </Button>
      )}
    </div>
  );
}

type TransactionGroupsProps = {
  transactions: Transaction[];
  accountId?: string;
  empty?: string;
  days?: readonly ListDay[];
  totals?: DayTotals;
};

export function TransactionGroups({
  transactions,
  accountId,
  empty,
  days,
  totals,
}: TransactionGroupsProps) {
  const { t } = useTranslation();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: counterparties } = useCounterparties();
  if (!accounts || !categories || !counterparties) return null;
  if (transactions.length === 0) return <EmptyState>{empty ?? t("transactions.none")}</EmptyState>;

  return (
    <div className="flex flex-col gap-5">
      {byDay(transactions).map(({ day, transactions }) => (
        <section key={day} className="flex flex-col gap-1">
          <DayHeader
            day={day}
            shown={transactions.length}
            listDay={days?.find((listDay) => listDay.day === day)}
            totals={totals}
          />
          <ul className="-mx-2 flex flex-col">
            {transactions.map((transaction) => (
              <li key={transaction.id}>
                <TransactionRow
                  transaction={transaction}
                  accounts={accounts}
                  categories={categories}
                  counterparties={counterparties}
                  accountId={accountId}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type DayHeaderProps = {
  day: string;
  shown: number;
  listDay: ListDay | undefined;
  totals: DayTotals | undefined;
};

function DayHeader({ day, shown, listDay, totals }: DayHeaderProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const total = totals?.totals.get(day);

  return (
    <div className="-mx-2 flex items-baseline gap-2 rounded-lg bg-zinc-100 px-2 py-1.5 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
      <h3 className="font-medium">{format.day(day)}</h3>
      {listDay && shown < listDay.count && (
        <span className="text-xs text-zinc-500">
          {t("transactions.dayPartlyShown", { shown, matching: listDay.count })}
        </span>
      )}
      {totals && total !== undefined && (
        <span className={`ml-auto text-base font-semibold tabular-nums ${totalClass(total)}`}>
          {total > 0 && "+"}
          {format.money(total, totals.currency)}
        </span>
      )}
    </div>
  );
}

type DayTotals = NonNullable<ReturnType<typeof useDayTotals>>;

type TransactionRowProps = {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
  counterparties: Counterparty[];
  accountId: string | undefined;
};

function TransactionRow({
  transaction,
  accounts,
  categories,
  counterparties,
  accountId,
}: TransactionRowProps) {
  const { data: users = [] } = useUsers();
  const { data: spaces = [] } = useSpaces();
  const location = useLocation();
  const shared = spaces.some(
    (space) => transaction.space_ids.includes(space.id) && !isPrivate(space),
  );

  return (
    <Link
      to={`/transactions/${transaction.id}`}
      state={openedFrom(location)}
      className="flex min-h-14 items-center gap-3 rounded-lg px-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <TransactionSummary
        transaction={transaction}
        accounts={accounts}
        categories={categories}
        counterparties={counterparties}
        accountId={accountId}
        creator={shared ? displayNameOf(users, transaction.created_by) : null}
      />
    </Link>
  );
}

type TransactionSummaryProps = {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
  counterparties: Counterparty[];
  accountId?: string;
  creator?: string | null;
};

export function TransactionSummary({
  transaction,
  accounts,
  categories,
  counterparties,
  accountId,
  creator = null,
}: TransactionSummaryProps) {
  const { t } = useTranslation();
  const money = useMoney();
  const category = categories.find(({ id }) => id === transaction.category_id);
  const counterparty = counterparties.find(({ id }) => id === transaction.counterparty_id);
  const otherSide = counterparty ?? category;
  // A forgiven debt has both, and says which built-in category it went to.
  const forgiveness = counterparty && category ? category.name : null;
  const nameOf = (id: string | null) =>
    id === null
      ? t("transactions.anotherSpace")
      : (accounts.find((account) => account.id === id)?.name ?? "");
  const where = otherSide
    ? nameOf(transaction.from_account_id ?? transaction.to_account_id)
    : `${nameOf(transaction.from_account_id)} → ${nameOf(transaction.to_account_id)}`;
  const amount = shownAmount(transaction, accountId);

  return (
    <>
      {counterparty && <CounterpartyIcon color={counterparty.color} />}
      {category && !counterparty && <CategoryIcon icon={category.icon} color={category.color} />}
      {!otherSide && (
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
        >
          <ArrowLeftRight className="size-4" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">
          {transactionLabel(transaction, categories, counterparties, t)}
        </span>
        <span className="truncate text-sm text-zinc-500">
          {[
            forgiveness,
            otherSide && transaction.title !== null ? otherSide.name : null,
            where,
            creator,
          ]
            .filter((part) => part)
            .join(" · ")}
        </span>
      </span>
      <span className={`font-medium tabular-nums ${amountClassOf(transaction.type, amount)}`}>
        {plusSign(amount.direction)}
        {money(signedAmount(amount), amount.currency)}
      </span>
    </>
  );
}

// Seen from one account, a transfer shows whether it left or reached it.
function seenFrom({ accountIds }: TransactionFilter): string | undefined {
  return accountIds?.length === 1 ? accountIds[0] : undefined;
}

function plusSign(direction: ShownAmount["direction"]): string {
  switch (direction) {
    case "in":
      return "+";
    case "out":
    case "between":
      return "";
  }
}

// Money lent or paid back is gray, like a transfer: neither earned nor spent.
function amountClassOf(type: TransactionType | null, { direction }: ShownAmount): string {
  switch (type) {
    case "given":
    case "received":
      return amountClass.between;
    case "expense":
    case "refund":
    case "income":
    case "transfer":
    case "forgave":
    case "forgiven":
    case null:
      return amountClass[direction];
  }
}

// Already newest first, so each day's transactions keep their order.
function byDay(transactions: Transaction[]) {
  const days: { day: string; transactions: Transaction[] }[] = [];
  for (const transaction of transactions) {
    const last = days.at(-1);
    if (last?.day === transaction.date) last.transactions.push(transaction);
    else days.push({ day: transaction.date, transactions: [transaction] });
  }
  return days;
}

function totalClass(total: number): string {
  if (total > 0) return amountClass.in;
  if (total < 0) return amountClass.out;
  return "";
}

const amountClass = {
  in: "text-emerald-700 dark:text-emerald-400",
  out: "text-red-600 dark:text-red-400",
  between: "text-zinc-500",
};
