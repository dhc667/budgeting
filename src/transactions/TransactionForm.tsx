import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccountOption } from "../accounts/account-options";
import { type Account, useAccounts } from "../accounts/account-queries";
import { type Budget, useBudgets } from "../budgets/budget-queries";
import { budgetsCounting } from "../budgets/coverage";
import { categoryOptions } from "../categories/category-options";
import { type Category, type CategoryKind, useCategories } from "../categories/category-queries";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { useCurrencies } from "../money/currency-queries";
import { useProfile } from "../profile/profile-queries";
import type { Schedule } from "../recurring/schedule";
import { scheduleFrom } from "../recurring/schedule-form";
import { ScheduleFields } from "../recurring/ScheduleFields";
import { bySpace } from "../spaces/by-space";
import { type Space, useSpaces } from "../spaces/space-queries";
import { isRaisedException } from "../supabase/errors";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { submitWithButton, textField } from "../ui/forms";
import { ChecklistField } from "../ui/ChecklistField";
import { Picker, type PickerOption } from "../ui/Picker";
import { TitleField } from "./TitleField";
import { draftOf } from "./transaction";
import {
  type TitleSuggestion,
  type TransactionDraft,
  type TransactionType,
  useTitleSuggestions,
} from "./transaction-queries";

type TransactionFormProps = {
  initial: TransactionDraft;
  // Archived accounts are offered only if the transaction already uses them.
  keptAccountIds: string[];
  submitLabel: string;
  mutation: { isPending: boolean; isSuccess: boolean; error: Error | null };
  saving: Saving;
};

type Saving =
  | {
      kind: "transaction";
      // The budgets it was left out of, among those it counts toward.
      excludedBudgetIds: string[];
      onSave: (draft: TransactionDraft, excludedBudgetIds: string[]) => void;
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
  const { data: spaces } = useSpaces();
  const { data: budgets } = useBudgets();
  if (!profile || !currencies || !accounts || !categories || !spaces || !budgets) return null;
  const offered = accounts.filter(
    ({ id, archived }) => !archived || props.keptAccountIds.includes(id),
  );
  return (
    <LoadedTransactionForm
      {...props}
      accounts={offered}
      categories={categories}
      spaces={spaces}
      budgets={budgets}
    />
  );
}

type LoadedProps = TransactionFormProps & {
  accounts: Account[];
  categories: Category[];
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
  spaces,
  budgets,
}: LoadedProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: currencies = [] } = useCurrencies();
  const { data: titles = [] } = useTitleSuggestions();
  const decimalsOf = (accountId: string | undefined) => {
    const currency = accounts.find(({ id }) => id === accountId)?.currency;
    return currencies.find(({ code }) => code === currency)?.decimals ?? 2;
  };
  const typedAmount = (amount: number | null, accountId: string | null | undefined) =>
    amount === null || amount <= 0 || !accountId
      ? ""
      : format.amount(amount, decimalsOf(accountId));
  const [tab, setTab] = useState(tabOf(initial.type));
  const [refund, setRefund] = useState(initial.type === "refund");
  const [accountId, setAccountId] = useState(
    accounts.some(({ id }) => id === initial.accountId) ? initial.accountId : accounts[0]?.id,
  );
  const [pickedCategoryId, setPickedCategoryId] = useState(initial.categoryId);
  const [toAccountId, setToAccountId] = useState(initial.toAccountId ?? "");
  const [title, setTitle] = useState(initial.title);
  const [amount, setAmount] = useState(() => typedAmount(initial.amount, initial.accountId));
  const [toAmount, setToAmount] = useState(() =>
    typedAmount(initial.toAmount, initial.toAccountId),
  );
  const [date, setDate] = useState(initial.date);
  const isRule = saving.kind === "rule";
  const [repeating, setRepeating] = useState(isRule);
  const [excludedBudgetIds, setExcludedBudgetIds] = useState(
    saving.kind === "transaction" ? saving.excludedBudgetIds : [],
  );
  const [problem, setProblem] = useState<Problem | null>(null);

  const type: TransactionType = tab === "expense" && refund ? "refund" : tab;
  const account = accounts.find(({ id }) => id === accountId);
  const toAccount = accounts.find(({ id }) => id === toAccountId && id !== accountId);
  const kind = categoryKindOf(tab);
  const offeredCategories = categories.filter(
    (category) => category.space_id === account?.space_id && category.kind === kind,
  );
  const category =
    offeredCategories.find(({ id }) => id === pickedCategoryId) ??
    suggestedCategory(title, titles, offeredCategories);
  const exchanged = toAccount !== undefined && toAccount.currency !== account?.currency;
  // Rules record transactions later, so they leave nothing out of budgets.
  const countedIn =
    tab === "expense" && !repeating && account && category
      ? budgetsCounting(budgets, { account, category, date })
      : [];

  const chooseAccount = (id: string) => {
    const chosen = accounts.find((candidate) => candidate.id === id);
    if (chosen?.space_id !== account?.space_id) setPickedCategoryId(null);
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
    if (picked) setAccountId(picked.id);
    setPickedCategoryId(draft.categoryId);
    setToAccountId(draft.toAccountId ?? "");
    setAmount(typedAmount(draft.amount, picked?.id ?? accountId));
    setToAmount(typedAmount(draft.toAmount, draft.toAccountId));
  };

  const save = (form: FormData, button: string | null) => {
    if (!account) return;
    const sent = format.parseAmount(amount, decimalsOf(account.id));
    const received = exchanged ? format.parseAmount(toAmount, decimalsOf(toAccount.id)) : null;
    const found = findProblem({
      type,
      amount: sent,
      category,
      toAccount,
      exchanged,
      toAmount: received,
    });
    setProblem(found);
    if (found || sent === null) return;
    const draft = {
      type,
      date,
      title: title.trim(),
      note: textField(form, "note").trim(),
      accountId: account.id,
      amount: sent,
      categoryId: category?.id ?? null,
      toAccountId: toAccount?.id ?? null,
      toAmount: received,
    };
    switch (saving.kind) {
      case "rule":
        return saving.onSave(draft, scheduleFrom(form, date));
      case "transaction":
        if (repeating && saving.onRepeat)
          return saving.onRepeat(draft, scheduleFrom(form, date), button === "record");
        return saving.onSave(
          draft,
          excludedBudgetIds.filter((id) => countedIn.some((budget) => budget.id === id)),
        );
    }
  };

  return (
    <form onSubmit={submitWithButton(save)} className="flex flex-col gap-4">
      <TitleField value={title} onChange={setTitle} suggestions={titles} onPick={pick} />
      <TypeTabs value={tab} onChange={setTab} />
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
      <Field
        label={t("transactions.form.amount")}
        name="amount"
        inputMode="decimal"
        autoComplete="off"
        required
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder={format.amount(0, decimalsOf(accountId))}
      />
      <AccountPicker
        label={tab === "transfer" ? t("transactions.form.from") : t("transactions.form.account")}
        accounts={accounts}
        spaces={spaces}
        value={accountId ?? null}
        onChange={chooseAccount}
      />
      {tab === "transfer" ? (
        <AccountPicker
          label={t("transactions.form.to")}
          accounts={accounts.filter(({ id }) => id !== accountId)}
          spaces={spaces}
          value={toAccount?.id ?? null}
          onChange={chooseToAccount}
        />
      ) : (
        <CategoryPicker
          categories={offeredCategories}
          value={category?.id ?? null}
          onChange={setPickedCategoryId}
        />
      )}
      {tab === "transfer" && exchanged && (
        <Field
          label={t("transactions.form.amountReceived")}
          hint={t("transactions.form.amountReceivedHint", { currency: toAccount.currency })}
          name="toAmount"
          inputMode="decimal"
          autoComplete="off"
          required
          value={toAmount}
          onChange={(event) => setToAmount(event.target.value)}
          placeholder={format.amount(0, decimalsOf(toAccount.id))}
        />
      )}
      {saving.kind === "transaction" && saving.onRepeat && (
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={repeating}
            onChange={(event) => setRepeating(event.target.checked)}
            className="size-5"
          />
          <span className="flex flex-col">
            {t("recurring.form.repeat")}
            <span className="text-xs text-zinc-500">{t("recurring.form.repeatHint")}</span>
          </span>
        </label>
      )}
      <Field
        label={dateLabel(isRule, repeating, t)}
        name="date"
        type="date"
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
        defaultValue={initial.note}
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

function TypeTabs({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("transactions.form.type")}
      className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800"
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === value}
          onClick={() => onChange(tab)}
          className="h-10 rounded-lg font-medium text-zinc-600 aria-selected:bg-white aria-selected:text-zinc-900 aria-selected:shadow-sm dark:text-zinc-400 dark:aria-selected:bg-zinc-900 dark:aria-selected:text-zinc-100"
        >
          {tabName(tab, t)}
        </button>
      ))}
    </div>
  );
}

type AccountPickerProps = {
  label: string;
  accounts: Account[];
  spaces: Space[];
  value: string | null;
  onChange: (accountId: string) => void;
};

// Every space's accounts are offered, whatever the space picker shows.
function AccountPicker({ label, accounts, spaces, value, onChange }: AccountPickerProps) {
  const { t } = useTranslation();
  const accountOption = useAccountOption();
  return (
    <Picker
      label={label}
      groups={bySpace(spaces, accounts, t, (inSpace) => inSpace.map(accountOption))}
      value={value}
      onChange={onChange}
      placeholder={t("transactions.form.chooseAccount")}
    />
  );
}

type CategoryPickerProps = {
  categories: Category[];
  value: string | null;
  onChange: (categoryId: string) => void;
};

function CategoryPicker({ categories, value, onChange }: CategoryPickerProps) {
  const { t } = useTranslation();
  return (
    <Picker
      label={t("transactions.form.category")}
      groups={[{ heading: null, options: categoryOptions(categories) }]}
      value={value}
      onChange={onChange}
      placeholder={t("transactions.form.chooseCategory")}
    />
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
  toAccount: Account | undefined;
  exchanged: boolean;
  toAmount: number | null;
};

function findProblem({
  type,
  amount,
  category,
  toAccount,
  exchanged,
  toAmount,
}: ProblemInput): Problem | null {
  if (amount === null || amount <= 0) return "amount";
  if (type !== "transfer") return category ? null : "category";
  if (!toAccount) return "toAccount";
  if (exchanged && (toAmount === null || toAmount <= 0)) return "toAmount";
  return null;
}

function problemMessage(problem: Problem, t: TFunction, example: string): string {
  switch (problem) {
    case "amount":
    case "toAmount":
      return t("transactions.errors.amount", { example });
    case "category":
      return t("transactions.errors.category");
    case "toAccount":
      return t("transactions.errors.toAccount");
  }
}

function saveErrorMessage(error: Error, t: TFunction): string {
  if (isRaisedException(error)) return t("transactions.errors.saveRefused");
  return t("transactions.errors.saveFailed");
}

function dateLabel(isRule: boolean, repeating: boolean, t: TFunction): string {
  if (isRule) return t("recurring.form.nextDue");
  return repeating ? t("recurring.form.startsOn") : t("transactions.form.date");
}

function tabOf(type: TransactionType): Tab {
  switch (type) {
    case "expense":
    case "refund":
      return "expense";
    case "income":
      return "income";
    case "transfer":
      return "transfer";
  }
}

function categoryKindOf(tab: Tab): CategoryKind | null {
  switch (tab) {
    case "expense":
      return "expense";
    case "income":
      return "income";
    case "transfer":
      return null;
  }
}

function tabName(tab: Tab, t: TFunction): string {
  switch (tab) {
    case "expense":
      return t("transactions.type.expense");
    case "income":
      return t("transactions.type.income");
    case "transfer":
      return t("transactions.type.transfer");
  }
}

const tabs = ["expense", "income", "transfer"] as const;

type Tab = (typeof tabs)[number];

type Problem = "amount" | "category" | "toAccount" | "toAmount";
