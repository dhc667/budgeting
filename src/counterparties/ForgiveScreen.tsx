import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { useAccountOption } from "../accounts/account-options";
import { type Account, openAccountsIn, useAccounts } from "../accounts/account-queries";
import { builtInCategoryName } from "../categories/category";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { useCurrencies } from "../money/currency-queries";
import { useMoney } from "../money/use-money";
import { useProfile } from "../profile/profile-queries";
import { refusalReason } from "../supabase/errors";
import type { TransactionDraft } from "../transactions/transaction-writes";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { Card, EmptyState } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { DateField } from "../ui/DateField";
import { submitWith } from "../ui/forms";
import { Picker } from "../ui/Picker";
import { useCounterparties, useCounterpartyTransactions, useForgive } from "./counterparty-queries";
import { CounterpartyNotFound } from "./CounterpartyScreen";
import { type CurrencyDebt, debtShares } from "./debt-shares";
import { owedPhrase } from "./owed";
import type { Counterparty } from "./read-counterparties";

export function ForgiveScreen() {
  const { t } = useTranslation();
  const { counterpartyId = "" } = useParams();
  const { data: counterparties } = useCounterparties();
  const { data: accounts } = useAccounts();
  const { data: transactions } = useCounterpartyTransactions(counterpartyId);
  // Amounts are typed in the user's number format, with their currency's decimals.
  const { data: profile } = useProfile();
  const { data: currencies } = useCurrencies();
  if (!counterparties || !accounts || !transactions || !profile || !currencies) return null;
  const counterparty = counterparties.find(({ id }) => id === counterpartyId);
  if (!counterparty) return <CounterpartyNotFound />;
  const debts = debtShares(counterparty, transactions, accounts);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to={`/counterparties/${counterparty.id}`} place={counterparty.name} />
        <h1 className="text-2xl font-semibold">
          {t("counterparties.forgive.title", { name: counterparty.name })}
        </h1>
      </header>
      {debts.length === 0 ? (
        <EmptyState>{t("counterparties.forgive.nothingOwed")}</EmptyState>
      ) : (
        <Card title={t("counterparties.forgive.details")}>
          <ForgiveForm counterparty={counterparty} debts={debts} accounts={accounts} />
        </Card>
      )}
    </div>
  );
}

type ForgiveFormProps = {
  counterparty: Counterparty;
  debts: CurrencyDebt[];
  accounts: Account[];
};

function ForgiveForm({ counterparty, debts: debtsNow, accounts }: ForgiveFormProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const forgive = useForgive();
  const { data: currencies = [] } = useCurrencies();
  const decimalsOf = (currency: string) =>
    currencies.find(({ code }) => code === currency)?.decimals ?? 2;
  // As owed when the form opened: once lines saved by a failed attempt sync, what's owed now would
  // refuse the retry of the rest as too much.
  const [debts] = useState(debtsNow);
  // Each line's id is the id of the transaction it saves, so a retry can't save it twice.
  const [linesByCurrency, setLinesByCurrency] = useState<Record<string, Line[]>>(() =>
    Object.fromEntries(
      debts.map(({ currency, shares }) => [
        currency,
        shares.map(({ accountId, amount }) => ({
          id: crypto.randomUUID(),
          accountId,
          amount: format.amount(amount, decimalsOf(currency)),
        })),
      ]),
    ),
  );
  const [date, setDate] = useState(localToday());
  const [problem, setProblem] = useState<Problem | null>(null);
  const linesOf = (currency: string) => linesByCurrency[currency] ?? [];
  const setLines = (currency: string, lines: Line[]) =>
    setLinesByCurrency((all) => ({ ...all, [currency]: lines }));

  const save = () => {
    const found = findProblem(debts, linesOf, (text, currency) =>
      format.parseAmount(text, decimalsOf(currency)),
    );
    setProblem(found);
    if (found) return;
    const forgiven = debts.flatMap(({ currency, owed }) =>
      linesOf(currency).flatMap(({ id, accountId, amount }) => {
        const parsed = format.parseAmount(amount, decimalsOf(currency));
        if (accountId === null || parsed === null || amount.trim() === "") return [];
        return [{ id, draft: draftOf(counterparty, owed, accountId, parsed, date) }];
      }),
    );
    forgive.mutate(forgiven, {
      onSuccess: () => void navigate(`/counterparties/${counterparty.id}`),
    });
  };

  return (
    <form onSubmit={submitWith(save)} className="flex flex-col gap-6">
      {debts.map(({ currency, owed }) => (
        <CurrencyLines
          key={currency}
          currency={currency}
          owed={owed}
          decimals={decimalsOf(currency)}
          accounts={openAccountsIn(accounts, counterparty.space_id).filter(
            (account) => account.currency === currency,
          )}
          lines={linesOf(currency)}
          onChange={(lines) => setLines(currency, lines)}
        />
      ))}
      <DateField
        label={t("transactions.form.date")}
        name="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        max={localToday()}
        required
      />
      {problem && <ErrorText>{problemMessage(problem, t)}</ErrorText>}
      {forgive.error && <ErrorText>{saveErrorMessage(forgive.error, t)}</ErrorText>}
      <Button type="submit" disabled={forgive.isPending} className="self-start">
        {t("counterparties.forgive.submit")}
      </Button>
    </form>
  );
}

type CurrencyLinesProps = {
  currency: string;
  owed: number;
  decimals: number;
  accounts: Account[];
  lines: Line[];
  onChange: (lines: Line[]) => void;
};

// One currency's debt, forgiven across as many accounts as the user splits it into.
function CurrencyLines({
  currency,
  owed,
  decimals,
  accounts,
  lines,
  onChange,
}: CurrencyLinesProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const money = useMoney();
  const accountOption = useAccountOption();
  const amountOf = (line: Line) => format.parseAmount(line.amount, decimals) ?? 0;
  const forgiven = lines.reduce((total, line) => total + amountOf(line), 0);
  const left = Math.abs(owed) - forgiven;
  const change = (id: string, change: Partial<Line>) =>
    onChange(lines.map((line) => (line.id === id ? { ...line, ...change } : line)));
  const fillWithRest = (line: Line) =>
    change(line.id, { amount: format.amount(Math.max(left + amountOf(line), 0), decimals) });
  const addLine = () =>
    onChange([...lines, { id: crypto.randomUUID(), accountId: null, amount: "" }]);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-lg font-semibold">
        {owedPhrase({ owed, currency }, money, t)}
      </legend>
      <p className="text-sm text-zinc-500">
        {owed > 0
          ? t("counterparties.forgive.asSpending", {
              category: builtInCategoryName("debts_forgiven", t),
            })
          : t("counterparties.forgive.asIncome", {
              category: builtInCategoryName("debts_forgiven_to_you", t),
            })}
      </p>
      {accounts.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {t("counterparties.forgive.noAccount", { currency })}
        </p>
      ) : (
        <>
          {lines.map((line) => (
            <div
              key={line.id}
              className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <Field
                label={
                  owed > 0
                    ? t("counterparties.forgive.amount")
                    : t("counterparties.forgive.amountToYou")
                }
                inputMode="decimal"
                autoComplete="off"
                value={line.amount}
                onChange={(event) => change(line.id, { amount: event.target.value })}
                placeholder={format.amount(0, decimals)}
              />
              <Picker
                label={t("transactions.form.account")}
                groups={[{ heading: null, options: accounts.map(accountOption) }]}
                value={line.accountId}
                onChange={(accountId) => change(line.id, { accountId })}
                placeholder={t("transactions.form.chooseAccount")}
              />
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => fillWithRest(line)}>
                  {t("counterparties.forgive.all")}
                </Button>
                {lines.length > 1 && (
                  <Button
                    variant="secondary"
                    onClick={() => onChange(lines.filter(({ id }) => id !== line.id))}
                  >
                    {t("counterparties.forgive.removeLine")}
                  </Button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="self-start text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            {t("counterparties.forgive.split")}
          </button>
          <p className="text-sm text-zinc-500">
            {left < 0
              ? t("counterparties.forgive.overBy", { amount: money(-left, currency) })
              : t("counterparties.forgive.leftAfter", {
                  owed: owedPhrase({ owed: Math.sign(owed) * left, currency }, money, t),
                })}
          </p>
        </>
      )}
    </fieldset>
  );
}

// Lines left empty are skipped.
function findProblem(
  debts: CurrencyDebt[],
  linesOf: (currency: string) => Line[],
  parse: (text: string, currency: string) => number | null,
): Problem | null {
  let forgivesAny = false;
  for (const { currency, owed } of debts) {
    let total = 0;
    for (const line of linesOf(currency)) {
      if (line.amount.trim() === "") continue;
      const amount = parse(line.amount, currency);
      if (amount === null || amount <= 0) return { kind: "amount" };
      if (line.accountId === null) return { kind: "account" };
      total += amount;
      forgivesAny = true;
    }
    if (total > Math.abs(owed)) return { kind: "tooMuch", currency };
  }
  return forgivesAny ? null : { kind: "nothing" };
}

// Above zero, the counterparty owed the space, which forgives it; below, the counterparty forgives
// the space.
function draftOf(
  counterparty: Counterparty,
  owed: number,
  accountId: string,
  amount: number,
  date: string,
): TransactionDraft {
  return {
    type: owed > 0 ? "forgave" : "forgiven",
    date,
    title: "",
    note: "",
    accountId,
    amount,
    categoryId: null,
    toAccountId: null,
    toAmount: null,
    counterpartyId: counterparty.id,
    debtCurrency: null,
    debtAmount: null,
  };
}

function saveErrorMessage(error: Error, t: TFunction): string {
  if (refusalReason(error) === "more_than_owed") {
    return t("counterparties.forgive.errors.moreThanOwed");
  }
  return t("counterparties.forgive.errors.saveFailed");
}

function problemMessage(problem: Problem, t: TFunction): string {
  switch (problem.kind) {
    case "amount":
      return t("counterparties.forgive.errors.amount");
    case "account":
      return t("counterparties.forgive.errors.account");
    case "tooMuch":
      return t("counterparties.forgive.errors.tooMuch", { currency: problem.currency });
    case "nothing":
      return t("counterparties.forgive.errors.nothing");
  }
}

// The amount as typed, in the user's number format.
type Line = { id: string; accountId: string | null; amount: string };

type Problem =
  | { kind: "amount" }
  | { kind: "account" }
  | { kind: "tooMuch"; currency: string }
  | { kind: "nothing" };
