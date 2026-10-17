import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { type Account, useAccounts } from "../accounts/account-queries";
import { type Category, useCategories } from "../categories/category-queries";
import { useFormat } from "../format/use-format";
import { TransactionSummary } from "../transactions/TransactionList";
import { BackLink } from "../ui/BackLink";
import { EmptyState } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { asTransaction, scheduleName } from "./recurring";
import {
  type RecurringTransaction,
  scheduleOf,
  useRecurringTransactions,
} from "./recurring-queries";
import { nextDueDate } from "./schedule";

export function RecurringScreen() {
  const { t } = useTranslation();
  const { data: rules, error } = useRecurringTransactions();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/transactions" place={t("nav.transactions")} />
        <h1 className="text-2xl font-semibold">{t("recurring.title")}</h1>
      </header>
      {error && <ErrorText>{t("recurring.errors.loadFailed")}</ErrorText>}
      {rules &&
        accounts &&
        categories &&
        (rules.length === 0 ? (
          <EmptyState>{t("recurring.none")}</EmptyState>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {rules.map((rule) => (
              <li key={rule.id}>
                <RuleRow rule={rule} accounts={accounts} categories={categories} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

type RuleRowProps = { rule: RecurringTransaction; accounts: Account[]; categories: Category[] };

function RuleRow({ rule, accounts, categories }: RuleRowProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const schedule = scheduleOf(rule);
  const next = nextDueDate(schedule, rule.done);
  const when = rule.paused
    ? t("recurring.paused")
    : next === null
      ? t("recurring.ended")
      : t("recurring.next", { date: format.day(next) });

  return (
    <Link
      to={`/recurring/${rule.id}`}
      className="flex flex-col rounded-lg px-2 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <span className="flex items-center gap-3">
        <TransactionSummary
          transaction={asTransaction(rule, accounts)}
          accounts={accounts}
          categories={categories}
        />
      </span>
      <span className="pl-11 text-sm text-zinc-500">
        {scheduleName(schedule, t)} · {when}
      </span>
    </Link>
  );
}
