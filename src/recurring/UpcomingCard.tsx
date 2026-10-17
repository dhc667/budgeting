import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type Account, useAccounts } from "../accounts/account-queries";
import { type Category, useCategories } from "../categories/category-queries";
import { localToday } from "../format/days";
import { useFormat } from "../format/use-format";
import { useCurrencies } from "../money/currency-queries";
import { useShownSpaces } from "../spaces/space-picker";
import { transactionLabel } from "../transactions/transaction";
import { TransactionSummary } from "../transactions/TransactionList";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { asTransaction, dueUpcoming } from "./recurring";
import {
  type Upcoming,
  useRecordUpcoming,
  useRecurringTransactions,
  useSkipUpcoming,
} from "./recurring-queries";

// Shown only while something is due: it stands in for a notification.
export function UpcomingCard() {
  const { t } = useTranslation();
  const shownSpaces = useShownSpaces();
  const { data: rules } = useRecurringTransactions();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  if (!shownSpaces || !rules || !accounts || !categories) return null;
  const shown = rules.filter((rule) => shownSpaces.some(({ id }) => id === rule.space_id));
  const due = dueUpcoming(shown, localToday());
  if (due.length === 0) return null;

  return (
    <Card title={t("dashboard.upcoming")}>
      <ul className="-mx-2 flex flex-col">
        {due.map((upcoming) => (
          <li key={upcoming.rule.id}>
            <UpcomingRow upcoming={upcoming} accounts={accounts} categories={categories} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

type UpcomingRowProps = { upcoming: Upcoming; accounts: Account[]; categories: Category[] };

function UpcomingRow({ upcoming, accounts, categories }: UpcomingRowProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [recording, setRecording] = useState(false);
  const skip = useSkipUpcoming();
  const transaction = asTransaction(upcoming.rule, accounts);

  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <span className="flex items-center gap-3">
        <TransactionSummary transaction={transaction} accounts={accounts} categories={categories} />
      </span>
      <span className="flex flex-wrap items-center gap-3 pl-11">
        <span className="flex-1 text-sm text-zinc-500">
          {t("recurring.due", { date: format.day(upcoming.due) })}
        </span>
        <Button variant="secondary" disabled={skip.isPending} onClick={() => skip.mutate(upcoming)}>
          {t("recurring.skip")}
        </Button>
        <Button onClick={() => setRecording(true)}>{t("recurring.record.submit")}</Button>
      </span>
      {skip.error && <ErrorText>{t("recurring.errors.skipFailed")}</ErrorText>}
      {recording && (
        <RecordDialog
          upcoming={upcoming}
          accounts={accounts}
          label={transactionLabel(transaction, categories, t)}
          onClose={() => setRecording(false)}
        />
      )}
    </div>
  );
}

type RecordDialogProps = {
  upcoming: Upcoming;
  accounts: Account[];
  label: string;
  onClose: () => void;
};

// The amount and date may differ from what the rule expected: a bill's real amount, paid late.
function RecordDialog({ upcoming, accounts, label, onClose }: RecordDialogProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: currencies = [] } = useCurrencies();
  const record = useRecordUpcoming();
  const { rule } = upcoming;
  const account = accounts.find(({ id }) => id === rule.account_id);
  const toAccount = accounts.find(({ id }) => id === rule.to_account_id);
  const exchanged = toAccount !== undefined && toAccount.currency !== account?.currency;
  const decimalsOf = (currency: string | undefined) =>
    currencies.find(({ code }) => code === currency)?.decimals ?? 2;
  const [amount, setAmount] = useState(() =>
    format.amount(rule.amount, decimalsOf(account?.currency)),
  );
  const [toAmount, setToAmount] = useState(() =>
    rule.to_amount === null ? "" : format.amount(rule.to_amount, decimalsOf(toAccount?.currency)),
  );
  const [date, setDate] = useState(() =>
    upcoming.due < localToday() ? upcoming.due : localToday(),
  );
  const sent = format.parseAmount(amount, decimalsOf(account?.currency));
  const received = exchanged ? format.parseAmount(toAmount, decimalsOf(toAccount.currency)) : null;
  const valid =
    sent !== null && sent > 0 && (!exchanged || (received !== null && received > 0)) && date !== "";

  const confirm = () => {
    if (!valid) return;
    record.mutate({ ...upcoming, date, amount: sent, toAmount: received }, { onSuccess: onClose });
  };

  return (
    <ConfirmDialog
      open
      title={t("recurring.record.title", { label })}
      confirmLabel={t("recurring.record.submit")}
      canConfirm={valid}
      pending={record.isPending}
      onConfirm={confirm}
      onCancel={onClose}
    >
      <Field
        label={t("transactions.form.amount")}
        inputMode="decimal"
        autoComplete="off"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      {exchanged && (
        <Field
          label={t("transactions.form.amountReceived")}
          hint={t("transactions.form.amountReceivedHint", { currency: toAccount.currency })}
          inputMode="decimal"
          autoComplete="off"
          value={toAmount}
          onChange={(event) => setToAmount(event.target.value)}
        />
      )}
      <Field
        label={t("transactions.form.date")}
        type="date"
        max={localToday()}
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      {record.error && <ErrorText>{t("recurring.errors.recordFailed")}</ErrorText>}
    </ConfirmDialog>
  );
}
