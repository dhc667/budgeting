import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { type Account, useAccounts } from "../accounts/account-queries";
import { CategoryIcon } from "../categories/CategoryIcon";
import { type Category, useCategories } from "../categories/category-queries";
import { useFormat } from "../format/use-format";
import { useMoney } from "../money/use-money";
import { displayNameOf, useUsers } from "../profile/profile-queries";
import { isPrivate } from "../spaces/space";
import { useSpaces } from "../spaces/space-queries";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { openedFrom } from "./list-filters";
import { type ShownAmount, shownAmount, signedAmount, transactionLabel } from "./transaction";
import { type Transaction, type TransactionFilter, useTransactions } from "./transaction-queries";

type TransactionListProps = { filter: TransactionFilter; empty?: string };

export function TransactionList({ filter, empty }: TransactionListProps) {
  const { t } = useTranslation();
  const { data, error, hasNextPage, fetchNextPage, isFetchingNextPage, isPlaceholderData } =
    useTransactions(filter);
  if (error) return <ErrorText>{t("transactions.errors.loadFailed")}</ErrorText>;
  if (!data) return null;
  const transactions = data.pages.flat();

  return (
    <div className="flex flex-col gap-3">
      {/* Seen from one account, a transfer shows whether it left or reached it. */}
      <TransactionGroups transactions={transactions} accountId={filter.accountId} empty={empty} />
      {hasNextPage && (
        // The pages shown may still be those of the filter before, until this one's first arrives.
        <Button
          variant="secondary"
          disabled={isFetchingNextPage || isPlaceholderData}
          onClick={() => void fetchNextPage()}
          className="self-start"
        >
          {t("transactions.showMore")}
        </Button>
      )}
    </div>
  );
}

type TransactionGroupsProps = { transactions: Transaction[]; accountId?: string; empty?: string };

export function TransactionGroups({ transactions, accountId, empty }: TransactionGroupsProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  if (!accounts || !categories) return null;
  if (transactions.length === 0) return <EmptyState>{empty ?? t("transactions.none")}</EmptyState>;

  return (
    <div className="flex flex-col gap-3">
      {byDay(transactions).map(({ day, transactions }) => (
        <section key={day} className="flex flex-col">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            {format.day(day)}
          </h3>
          <ul className="-mx-2 flex flex-col">
            {transactions.map((transaction) => (
              <li key={transaction.id}>
                <TransactionRow
                  transaction={transaction}
                  accounts={accounts}
                  categories={categories}
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

type TransactionRowProps = {
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
  accountId: string | undefined;
};

function TransactionRow({ transaction, accounts, categories, accountId }: TransactionRowProps) {
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
  accountId?: string;
  creator?: string | null;
};

export function TransactionSummary({
  transaction,
  accounts,
  categories,
  accountId,
  creator = null,
}: TransactionSummaryProps) {
  const { t } = useTranslation();
  const money = useMoney();
  const category = categories.find(({ id }) => id === transaction.category_id);
  const nameOf = (id: string | null) =>
    id === null
      ? t("transactions.anotherSpace")
      : (accounts.find((account) => account.id === id)?.name ?? "");
  const where = category
    ? nameOf(transaction.from_account_id ?? transaction.to_account_id)
    : `${nameOf(transaction.from_account_id)} → ${nameOf(transaction.to_account_id)}`;
  const amount = shownAmount(transaction, accountId);

  return (
    <>
      {category ? (
        <CategoryIcon icon={category.icon} color={category.color} />
      ) : (
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
        >
          <ArrowLeftRight className="size-4" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{transactionLabel(transaction, categories, t)}</span>
        <span className="truncate text-sm text-zinc-500">
          {[category && transaction.title !== null ? category.name : null, where, creator]
            .filter((part) => part)
            .join(" · ")}
        </span>
      </span>
      <span className={`font-medium tabular-nums ${amountClass[amount.direction]}`}>
        {plusSign(amount.direction)}
        {money(signedAmount(amount), amount.currency)}
      </span>
    </>
  );
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

const amountClass = {
  in: "text-emerald-700 dark:text-emerald-400",
  out: "",
  between: "text-zinc-500",
};
