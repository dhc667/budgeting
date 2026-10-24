import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Account, useAccounts } from "../accounts/account-queries";
import { type Budget, useBudgets } from "../budgets/budget-queries";
import { budgetsCounting } from "../budgets/coverage";
import { type Category, useCategories } from "../categories/category-queries";
import { useCounterparties } from "../counterparties/counterparty-queries";
import { CounterpartyPicker } from "../counterparties/CounterpartyPicker";
import { wholeDebtSettledBy } from "../counterparties/owed";
import type { Counterparty } from "../counterparties/read-counterparties";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { CurrencyPicker } from "../money/CurrencyPicker";
import { useCurrencies } from "../money/currency-queries";
import { useProfile } from "../profile/profile-queries";
import type { Schedule } from "../recurring/schedule";
import { scheduleFrom } from "../recurring/schedule-form";
import { ScheduleFields } from "../recurring/ScheduleFields";
import { useShownSpaces } from "../spaces/space-picker";
import { type Space, useSpaces } from "../spaces/space-queries";
import { isRaisedException, refusalReason } from "../supabase/errors";
import { AmountField } from "../ui/AmountField";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { DateField } from "../ui/DateField";
import { submitWithButton } from "../ui/forms";
import { ChecklistField } from "../ui/ChecklistField";
import type { PickerOption } from "../ui/Picker";
import { TitleField } from "./TitleField";
import { AccountPicker, CategoryPicker } from "./TransactionPickers";
import {
  categoryKindOf,
  debtTypeOf,
  isForgiveness,
  ruleTabs,
  tabOf,
  tabs,
  typeOf,
} from "./transaction-tabs";
import { DirectionChoice, TypeTabs } from "./TypeTabs";
import { type Extras, type TitleSuggestion, useTitleSuggestions } from "./transaction-queries";
import {
  draftOf,
  otherSideOf,
  type TransactionDraft,
  type TransactionType,
} from "./transaction-writes";

type TransactionFormProps = {
  initial: TransactionDraft;
  // Archived accounts, and those in spaces the space picker hides, are offered only if the
  // transaction already uses them.
  keptAccountIds: string[];
  // Spaces whose accounts are offered even while the space picker hides them.
  keptSpaceIds?: string[];
  submitLabel: string;
  mutation: { isPending: boolean; isSuccess: boolean; error: Error | null };
  saving: Saving;
  // Fills in all that's owed for a debt the transaction settles. Only for a new one: an edited one
  // is already part of what's owed.
  offersWholeDebt?: boolean;
  // Hears what's in the form as the user changes it, with only the amounts they typed themselves.
  onChange?: (draft: TransactionDraft) => void;
};

type Saving =
  | {
      kind: "transaction";
      // The budgets it was left out of, among those it counts toward.
      excludedBudgetIds: string[];
      onSave: (draft: TransactionDraft, extras: Extras) => void;
      // Offers to repeat it instead. Its date is then where the schedule starts, and may be ahead.
      onRepeat?: (draft: TransactionDraft, schedule: Schedule, recordFirst: boolean) => void;
    }
  // A recurring transaction's, whose date is when the next one is due.
  | {
      kind: "rule";
      schedule: Schedule;
      onSave: (draft: TransactionDraft, schedule: Schedule) => void;
    };

// Amounts are typed in the user's number format, so the form waits for the profile that says which.
export function TransactionForm(props: TransactionFormProps) {
  const { data: profile } = useProfile();
  const { data: currencies } = useCurrencies();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const shownSpaces = useShownSpaces();
  const { data: budgets } = useBudgets();
  const { data: counterparties } = useCounterparties();
  const { data: spaces } = useSpaces();
  if (!profile || !currencies || !accounts || !categories || !spaces || !budgets) return null;
  if (!counterparties || !shownSpaces) return null;
  const offeredSpaceIds = [...shownSpaces.map(({ id }) => id), ...(props.keptSpaceIds ?? [])];
  const offered = accounts.filter(
    ({ id, archived, space_id }) =>
      props.keptAccountIds.includes(id) || (!archived && offeredSpaceIds.includes(space_id)),
  );
  return (
    <LoadedTransactionForm
      {...props}
      accounts={offered}
      categories={categories}
      counterparties={counterparties}
      spaces={spaces.filter(({ id }) => offered.some(({ space_id }) => space_id === id))}
      budgets={budgets}
    />
  );
}

type LoadedProps = TransactionFormProps & {
  accounts: Account[];
  categories: Category[];
  counterparties: Counterparty[];
  spaces: Space[];
  budgets: Budget[];
};

function LoadedTransactionForm({
  initial,
  submitLabel,
  mutation,
  saving,
  accounts,
  categories,
  counterparties,
  spaces,
  budgets,
  offersWholeDebt = false,
  onChange,
}: LoadedProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: currencies = [] } = useCurrencies();
  const { data: titles = [] } = useTitleSuggestions();
  const decimalsIn = (currency: string | null | undefined) =>
    currencies.find(({ code }) => code === currency)?.decimals ?? 2;
  const decimalsOf = (accountId: string | null | undefined) =>
    decimalsIn(accounts.find(({ id }) => id === accountId)?.currency);
  const amountText = (amount: number | null, accountId: string | null | undefined) =>
    amount === null || amount <= 0 || !accountId
      ? ""
      : format.amount(amount, decimalsOf(accountId));
  const debtAmountText = (amount: number | null, currency: string | null) =>
    amount === null || amount <= 0 || currency === null
      ? ""
      : format.amount(amount, decimalsIn(currency));
  const [tab, setTab] = useState(tabOf(initial.type));
  const [refund, setRefund] = useState(initial.type === "refund");
  const [debt, setDebt] = useState(debtTypeOf(initial.type) ?? "given");
  const [accountId, setAccountId] = useState(
    accounts.some(({ id }) => id === initial.accountId) ? initial.accountId : accounts[0]?.id,
  );
  const [pickedCategoryId, setPickedCategoryId] = useState(initial.categoryId);
  const [pickedCounterpartyId, setPickedCounterpartyId] = useState(initial.counterpartyId);
  // One id for every attempt, so a retry after a lost reply can't add the counterparty twice.
  const [newCounterpartyId] = useState(() => crypto.randomUUID());
  const [newCounterpartyName, setNewCounterpartyName] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState(initial.toAccountId ?? "");
  const [title, setTitle] = useState(initial.title);
  // Null until the user gives one, while the form may fill one in for them.
  const [ownAmount, setOwnAmount] = useState(() =>
    initial.amount > 0 ? amountText(initial.amount, initial.accountId) : null,
  );
  const [toAmount, setToAmount] = useState(() => amountText(initial.toAmount, initial.toAccountId));
  // Null while the debt is in the account's currency.
  const [debtCurrency, setDebtCurrency] = useState(initial.debtCurrency);
  const [debtAmount, setDebtAmount] = useState(() =>
    debtAmountText(initial.debtAmount, initial.debtCurrency),
  );
  const [date, setDate] = useState(initial.date);
  const [note, setNote] = useState(initial.note);
  const isRule = saving.kind === "rule";
  const [repeatChecked, setRepeatChecked] = useState(isRule);
  // Recurring transactions don't give or receive money yet.
  const repeating = repeatChecked && tab !== "debt";
  const [excludedBudgetIds, setExcludedBudgetIds] = useState(
    saving.kind === "transaction" ? saving.excludedBudgetIds : [],
  );
  const [problem, setProblem] = useState<Problem | null>(null);

  const type = typeOf(tab, { refund, debt });
  const account = accounts.find(({ id }) => id === accountId);
  const toAccount = accounts.find(({ id }) => id === toAccountId && id !== accountId);
  const movesMoney = type === "given" || type === "received";
  const debtExchanged = movesMoney && debtCurrency !== null && debtCurrency !== account?.currency;
  const kind = categoryKindOf(tab);
  const offeredCategories = categories.filter(
    (category) =>
      category.space_id === account?.space_id &&
      category.kind === kind &&
      category.built_in === null,
  );
  const category =
    offeredCategories.find(({ id }) => id === pickedCategoryId) ??
    suggestedCategory(title, titles, offeredCategories);
  const offeredCounterparties = counterparties.filter(
    ({ space_id }) => space_id === account?.space_id,
  );
  const newCounterparty =
    newCounterpartyName === null ? null : { id: newCounterpartyId, name: newCounterpartyName };
  const existingCounterparty = offeredCounterparties.find(({ id }) => id === pickedCounterpartyId);
  const counterparty =
    pickedCounterpartyId === newCounterpartyId
      ? (newCounterparty ?? undefined)
      : existingCounterparty;
  const owed = debtExchanged
    ? undefined
    : existingCounterparty?.balances.find(({ currency }) => currency === account?.currency)?.owed;
  const wholeDebt =
    offersWholeDebt && tab === "debt" && owed !== undefined ? wholeDebtSettledBy(debt, owed) : null;
  const wholeDebtText = wholeDebt === null ? null : amountText(wholeDebt, accountId);
  const amount = ownAmount ?? wholeDebtText ?? "";
  // Debts in other currencies than the account's that the money would settle, which the user then
  // says how much of the account's currency paid.
  const otherWholeDebts =
    offersWholeDebt && movesMoney
      ? (existingCounterparty?.balances ?? []).flatMap((balance) => {
          const settled = wholeDebtSettledBy(debt, balance.owed);
          if (balance.currency === account?.currency || settled === null) return [];
          return [{ currency: balance.currency, text: debtAmountText(settled, balance.currency) }];
        })
      : [];
  const exchanged = toAccount !== undefined && toAccount.currency !== account?.currency;
  // Rules record transactions later, so they leave nothing out of budgets.
  const typedAmount =
    ownAmount === null ? null : format.parseAmount(ownAmount, decimalsOf(accountId));
  const typedToAmount = toAccount ? format.parseAmount(toAmount, decimalsOf(toAccount.id)) : null;
  const typedDebtAmount = debtExchanged
    ? format.parseAmount(debtAmount, decimalsIn(debtCurrency))
    : null;

  useEffect(() => {
    onChange?.({
      type,
      date,
      title,
      note,
      accountId: accountId ?? "",
      amount: typedAmount ?? 0,
      categoryId: pickedCategoryId,
      toAccountId: toAccount?.id ?? null,
      toAmount: typedToAmount,
      counterpartyId: pickedCounterpartyId,
      debtCurrency: debtExchanged ? debtCurrency : null,
      debtAmount: typedDebtAmount,
    });
  }, [
    onChange,
    type,
    date,
    title,
    note,
    accountId,
    typedAmount,
    pickedCategoryId,
    toAccount?.id,
    typedToAmount,
    pickedCounterpartyId,
    debtExchanged,
    debtCurrency,
    typedDebtAmount,
  ]);

  const countedIn =
    tab === "expense" && !repeating && account && category
      ? budgetsCounting(budgets, { account, category, date })
      : [];

  const chooseAccount = (id: string) => {
    const chosen = accounts.find((candidate) => candidate.id === id);
    if (chosen?.space_id !== account?.space_id) {
      setPickedCategoryId(null);
      // A counterparty named in the form is added to whichever space the account is in.
      if (pickedCounterpartyId !== newCounterpartyId) setPickedCounterpartyId(null);
    }
    setAccountId(id);
  };

  const chooseToAccount = (id: string) => {
    setToAccountId(id);
    setToAmount("");
  };

  // Fills in the rest the way that transaction had it, but for when it happened and why.
  const pick = (suggestion: TitleSuggestion) => {
    const draft = draftOf(suggestion, categories);
    const picked = accounts.find(({ id }) => id === draft.accountId);
    setTitle(draft.title);
    setTab(tabOf(draft.type));
    setRefund(draft.type === "refund");
    setDebt(debtTypeOf(draft.type) ?? "given");
    if (picked) setAccountId(picked.id);
    setPickedCategoryId(draft.categoryId);
    setPickedCounterpartyId(draft.counterpartyId);
    setToAccountId(draft.toAccountId ?? "");
    setOwnAmount(amountText(draft.amount, picked?.id ?? accountId));
    setToAmount(amountText(draft.toAmount, draft.toAccountId));
    setDebtCurrency(draft.debtCurrency);
    setDebtAmount(debtAmountText(draft.debtAmount, draft.debtCurrency));
  };

  const save = (form: FormData, button: string | null) => {
    if (!account) return;
    const sent = format.parseAmount(amount, decimalsOf(account.id));
    const amountReceived = exchanged
      ? format.parseAmount(toAmount, decimalsOf(toAccount.id))
      : null;
    const found = findProblem({
      type,
      amount: sent,
      category,
      counterparty,
      toAccount,
      exchanged,
      toAmount: amountReceived,
      debtExchanged,
      debtAmount: typedDebtAmount,
    });
    setProblem(found);
    if (found || sent === null) return;
    const draft = {
      type,
      date,
      title: title.trim(),
      note: note.trim(),
      accountId: account.id,
      amount: sent,
      categoryId: category?.id ?? null,
      toAccountId: toAccount?.id ?? null,
      toAmount: amountReceived,
      counterpartyId: counterparty?.id ?? null,
      debtCurrency: debtExchanged ? debtCurrency : null,
      debtAmount: typedDebtAmount,
    };
    switch (saving.kind) {
      case "rule":
        return saving.onSave(draft, scheduleFrom(form, date));
      case "transaction":
        if (repeating && saving.onRepeat)
          return saving.onRepeat(draft, scheduleFrom(form, date), button === "record");
        return saving.onSave(draft, {
          excludedBudgetIds: keptExclusions(excludedBudgetIds, countedIn, saving.excludedBudgetIds),
          newCounterparty:
            otherSideOf(type) === "counterparty" && counterparty?.id === newCounterpartyId
              ? { id: newCounterpartyId, spaceId: account.space_id, name: counterparty.name }
              : null,
        });
    }
  };

  return (
    <form onSubmit={submitWithButton(save)} className="flex flex-col gap-4">
      <TitleField value={title} onChange={setTitle} suggestions={titles} onPick={pick} />
      <TypeTabs tabs={isRule ? ruleTabs : tabs} value={tab} onChange={setTab} />
      {tab === "expense" && (
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={refund}
            onChange={(event) => setRefund(event.target.checked)}
            className="size-5"
          />
          <span className="flex flex-col">
            {t("transactions.form.refund")}
            <span className="text-xs text-zinc-500">{t("transactions.form.refundHint")}</span>
          </span>
        </label>
      )}
      {tab === "debt" && (
        <DirectionChoice
          value={debt}
          forgiveness={isForgiveness(initial.type)}
          onChange={setDebt}
        />
      )}
      <AmountField
        label={t("transactions.form.amount")}
        name="amount"
        required
        value={amount}
        decimals={decimalsOf(accountId)}
        onChange={setOwnAmount}
        // So that typing replaces an amount filled in for the user rather than adding to it.
        onFocus={(event) => ownAmount === null && event.target.select()}
        placeholder={format.amount(0, decimalsOf(accountId))}
      />
      {wholeDebtText !== null && amount !== wholeDebtText && account && (
        <button
          type="button"
          onClick={() => setOwnAmount(wholeDebtText)}
          className="-mt-2 self-start text-sm font-medium text-emerald-700 dark:text-emerald-400"
        >
          {t("transactions.form.wholeDebt", {
            amount: wholeDebtText,
            currency: account.currency,
          })}
        </button>
      )}
      {otherWholeDebts
        .filter(
          ({ currency, text }) =>
            !(debtExchanged && debtCurrency === currency && debtAmount === text),
        )
        .map(({ currency, text }) => (
          <button
            key={currency}
            type="button"
            onClick={() => {
              setDebtCurrency(currency);
              setDebtAmount(text);
            }}
            className="-mt-2 self-start text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            {t("transactions.form.wholeDebt", { amount: text, currency })}
          </button>
        ))}
      <AccountPicker
        label={tab === "transfer" ? t("transactions.form.from") : t("transactions.form.account")}
        accounts={accounts}
        spaces={spaces}
        value={accountId ?? null}
        onChange={chooseAccount}
      />
      {tab === "transfer" && (
        <AccountPicker
          label={t("transactions.form.to")}
          accounts={accounts.filter(({ id }) => id !== accountId)}
          spaces={spaces}
          value={toAccount?.id ?? null}
          onChange={chooseToAccount}
        />
      )}
      {(tab === "expense" || tab === "income") && (
        <CategoryPicker
          categories={offeredCategories}
          value={category?.id ?? null}
          onChange={setPickedCategoryId}
        />
      )}
      {tab === "debt" && (
        <CounterpartyPicker
          counterparties={offeredCounterparties}
          named={newCounterparty}
          value={counterparty?.id ?? null}
          onChange={setPickedCounterpartyId}
          onName={(name) => {
            setNewCounterpartyName(name);
            setPickedCounterpartyId(newCounterpartyId);
          }}
        />
      )}
      {movesMoney && account && debtCurrency === null && (
        <button
          type="button"
          onClick={() => setDebtCurrency(account.currency)}
          className="-mt-2 self-start text-sm font-medium text-emerald-700 dark:text-emerald-400"
        >
          {t("transactions.form.otherCurrency")}
        </button>
      )}
      {movesMoney && debtCurrency !== null && (
        <>
          <CurrencyPicker
            label={t("transactions.form.debtIn")}
            value={debtCurrency}
            onChange={setDebtCurrency}
          />
          {debtExchanged && (
            <AmountField
              label={t("transactions.form.debtAmount")}
              hint={t("transactions.form.debtAmountHint", { currency: debtCurrency })}
              name="debtAmount"
              required
              value={debtAmount}
              decimals={decimalsIn(debtCurrency)}
              onChange={setDebtAmount}
              placeholder={format.amount(0, decimalsIn(debtCurrency))}
            />
          )}
          <button
            type="button"
            onClick={() => {
              setDebtCurrency(null);
              setDebtAmount("");
            }}
            className="-mt-2 self-start text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            {t("transactions.form.sameCurrency")}
          </button>
        </>
      )}
      {tab === "transfer" && exchanged && (
        <AmountField
          label={t("transactions.form.amountReceived")}
          hint={t("transactions.form.amountReceivedHint", { currency: toAccount.currency })}
          name="toAmount"
          required
          value={toAmount}
          decimals={decimalsOf(toAccount.id)}
          onChange={setToAmount}
          placeholder={format.amount(0, decimalsOf(toAccount.id))}
        />
      )}
      {saving.kind === "transaction" && saving.onRepeat && tab !== "debt" && (
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={repeatChecked}
            onChange={(event) => setRepeatChecked(event.target.checked)}
            className="size-5"
          />
          <span className="flex flex-col">
            {t("recurring.form.repeat")}
            <span className="text-xs text-zinc-500">{t("recurring.form.repeatHint")}</span>
          </span>
        </label>
      )}
      <DateField
        label={dateLabel(isRule, repeating, t)}
        name="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        max={repeating ? undefined : localToday()}
        required
      />
      {repeating && (
        <ScheduleFields initial={saving.kind === "rule" ? saving.schedule : null} startsOn={date} />
      )}
      {countedIn.length > 0 && (
        <ChecklistField
          label={t("transactions.form.leftOutOf")}
          groups={[{ heading: null, options: countedIn.map(budgetOption) }]}
          value={excludedBudgetIds}
          onChange={setExcludedBudgetIds}
          none={t("transactions.form.countedInAll")}
          several={(count) => t("transactions.form.leftOutOfSome", { count })}
        />
      )}
      <Field
        label={t("transactions.form.note")}
        name="note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        autoComplete="off"
      />
      {problem && (
        <ErrorText>
          {problemMessage(problem, t, format.amount(123456, decimalsOf(accountId)))}
        </ErrorText>
      )}
      {mutation.error && <ErrorText>{saveErrorMessage(mutation.error, t)}</ErrorText>}
      {mutation.isSuccess && (
        <p className="text-sm text-emerald-600">{t("transactions.form.saved")}</p>
      )}
      {repeating && !isRule ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            value="record"
            disabled={mutation.isPending || !account || date > localToday()}
          >
            {t("recurring.form.saveAndRepeat")}
          </Button>
          <Button
            type="submit"
            variant="secondary"
            value="later"
            disabled={mutation.isPending || !account}
          >
            {t("recurring.form.repeatFromThen")}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={mutation.isPending || !account} className="self-start">
          {submitLabel}
        </Button>
      )}
    </form>
  );
}

// One left out of a budget it no longer counts toward stays left out, rather than its History saying
// it counts again, and stays out should the transaction come back to it.
function keptExclusions(excluded: string[], countedIn: Budget[], stored: string[]): string[] {
  return excluded.filter(
    (id) => countedIn.some((budget) => budget.id === id) || stored.includes(id),
  );
}

function budgetOption(budget: Budget): PickerOption {
  return {
    id: budget.id,
    label: budget.name,
    content: <span className="flex-1 truncate">{budget.name}</span>,
  };
}

// The latest category this user gave the same title, among those the form offers.
function suggestedCategory(
  title: string,
  titles: TitleSuggestion[],
  offered: Category[],
): Category | undefined {
  const wanted = title.trim().toLowerCase();
  if (wanted === "") return undefined;
  return titles
    .filter((suggestion) => suggestion.title.toLowerCase() === wanted)
    .map(({ category_id }) => offered.find(({ id }) => id === category_id))
    .find((category) => category !== undefined);
}

type ProblemInput = {
  type: TransactionType;
  amount: number | null;
  category: Category | undefined;
  counterparty: { id: string } | undefined;
  toAccount: Account | undefined;
  exchanged: boolean;
  toAmount: number | null;
  debtExchanged: boolean;
  debtAmount: number | null;
};

function findProblem({
  type,
  amount,
  category,
  counterparty,
  toAccount,
  exchanged,
  toAmount,
  debtExchanged,
  debtAmount,
}: ProblemInput): Problem | null {
  if (amount === null || amount <= 0) return "amount";
  switch (otherSideOf(type)) {
    case "category":
      return category ? null : "category";
    case "counterparty":
      if (!counterparty) return "counterparty";
      if (debtExchanged && (debtAmount === null || debtAmount <= 0)) return "debtAmount";
      return null;
    case "toAccount":
      if (!toAccount) return "toAccount";
      if (exchanged && (toAmount === null || toAmount <= 0)) return "toAmount";
      return null;
  }
}

function problemMessage(problem: Problem, t: TFunction, example: string): string {
  switch (problem) {
    case "amount":
    case "toAmount":
    case "debtAmount":
      return t("transactions.errors.amount", { example });
    case "category":
      return t("transactions.errors.category");
    case "counterparty":
      return t("transactions.errors.counterparty");
    case "toAccount":
      return t("transactions.errors.toAccount");
  }
}

function saveErrorMessage(error: Error, t: TFunction): string {
  if (refusalReason(error) === "more_than_owed") return t("transactions.errors.moreThanOwed");
  if (isRaisedException(error)) return t("transactions.errors.saveRefused");
  return t("transactions.errors.saveFailed");
}

function dateLabel(isRule: boolean, repeating: boolean, t: TFunction): string {
  if (isRule) return t("recurring.form.nextDue");
  return repeating ? t("recurring.form.startsOn") : t("transactions.form.date");
}

type Problem = "amount" | "category" | "counterparty" | "toAccount" | "toAmount" | "debtAmount";
