import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  type Account,
  accountsInSpaces,
  openAccountsIn,
  useAccounts,
} from "../accounts/account-queries";
import {
  useCounterparties,
  useCounterpartyTransactions,
} from "../counterparties/counterparty-queries";
import { type CurrencyDebt, debtShares } from "../counterparties/debt-shares";
import { wholeDebtSettledBy } from "../counterparties/owed";
import type { Counterparty } from "../counterparties/read-counterparties";
import { localToday } from "../format/days";
import { useCreateRecurringTransaction } from "../recurring/recurring-queries";
import { useShownSpaces } from "../spaces/space-picker";
import { type Space } from "../spaces/space-queries";
import { BackLink } from "../ui/BackLink";
import { Card, EmptyState } from "../ui/Card";
import { useKeptDraft } from "./kept-draft";
import { useLastAccount } from "./last-account";
import { useAddTransaction } from "./transaction-queries";
import { TransactionForm } from "./TransactionForm";

export function NewTransactionScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: accounts } = useAccounts();
  const { data: counterparties } = useCounterparties();
  const [params] = useSearchParams();
  const { kept, keep, forget } = useKeptDraft(params.toString());
  const [resumed, setResumed] = useState(kept !== null);
  const { data: transactions } = useCounterpartyTransactions(params.get("counterparty") ?? "");
  const { lastAccountId, remember } = useLastAccount();
  const shownSpaces = useShownSpaces();
  const addTransaction = useAddTransaction();
  const createRecurring = useCreateRecurringTransaction();
  // One id for every attempt, so a retry after a lost reply can't save it twice.
  const [id] = useState(() => crypto.randomUUID());
  if (!accounts || !counterparties || !transactions || !shownSpaces) return null;
  const counterparty = counterparties.find(({ id }) => id === params.get("counterparty"));
  const debts = counterparty ? debtShares(counterparty, transactions, accounts) : [];
  const type = counterparty ? debtType(params.get("type")) : "expense";
  const backTo = counterparty ? `/counterparties/${counterparty.id}` : "/transactions";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to={backTo} place={counterparty ? counterparty.name : t("nav.transactions")} />
        <h1 className="text-2xl font-semibold">{t("transactions.new.title")}</h1>
      </header>
      {accounts.some(({ archived }) => !archived) ? (
        <Card title={t("transactions.details")}>
          {resumed && (
            <p className="-mt-1 text-sm text-zinc-500">
              {t("transactions.new.resumed")}{" "}
              <button
                type="button"
                onClick={() => {
                  forget();
                  setResumed(false);
                }}
                className="font-medium text-emerald-700 dark:text-emerald-400"
              >
                {t("transactions.new.startOver")}
              </button>
            </p>
          )}
          <TransactionForm
            key={resumed ? "resumed" : "blank"}
            initial={
              (resumed && kept) || {
                type,
                date: localToday(),
                title: "",
                note: "",
                accountId:
                  accountFor(counterparty, type, accounts, debts, lastAccountId, shownSpaces) ?? "",
                amount: 0,
                categoryId: null,
                toAccountId: null,
                toAmount: null,
                counterpartyId: counterparty?.id ?? null,
              }
            }
            keptAccountIds={[]}
            offersWholeDebt
            onChange={keep}
            submitLabel={t("transactions.new.submit")}
            mutation={{
              isPending: addTransaction.isPending || createRecurring.isPending,
              isSuccess: false,
              error: addTransaction.error ?? createRecurring.error,
            }}
            saving={{
              kind: "transaction",
              excludedBudgetIds: [],
              onSave: (draft, extras) =>
                addTransaction.mutate(
                  { ...draft, ...extras, id },
                  {
                    onSuccess: () => {
                      forget();
                      remember(draft.accountId);
                      void navigate(backTo);
                    },
                  },
                ),
              onRepeat: (draft, schedule, recordFirst) =>
                createRecurring.mutate(
                  { draft, schedule, recordFirst },
                  {
                    onSuccess: () => {
                      forget();
                      remember(draft.accountId);
                      void navigate("/recurring");
                    },
                  },
                ),
            }}
          />
        </Card>
      ) : (
        <>
          <EmptyState>{t("transactions.new.noAccounts")}</EmptyState>
          <Link to="/accounts/new" className="font-medium text-emerald-700 dark:text-emerald-400">
            {t("accounts.add")}
          </Link>
        </>
      )}
    </div>
  );
}

function debtType(type: string | null): "given" | "received" {
  return type === "received" ? "received" : "given";
}

// Money given or received stays in the counterparty's space, so the account must be there too.
// Paying back what's owed starts from an account the debt sits in, the newest first. Anything
// else starts in the spaces the space picker shows.
function accountFor(
  counterparty: Counterparty | undefined,
  type: "given" | "received" | "expense",
  accounts: Account[],
  debts: CurrencyDebt[],
  lastAccountId: string | null,
  shownSpaces: Space[],
): string | null {
  if (!counterparty || type === "expense") {
    const shown = accountsInSpaces(accounts, shownSpaces).filter(({ archived }) => !archived);
    if (shown.length === 0) return lastAccountId;
    return shown.find(({ id }) => id === lastAccountId)?.id ?? shown[0]?.id ?? null;
  }
  const holding = debts
    .filter(({ owed }) => wholeDebtSettledBy(type, owed) !== null)
    .flatMap(({ shares }) => shares.map(({ accountId }) => accountId));
  const inSpace = openAccountsIn(accounts, counterparty.space_id).map(({ id }) => id);
  const candidates = holding.length > 0 ? holding : inSpace;
  return candidates.find((id) => id === lastAccountId) ?? candidates[0] ?? null;
}
