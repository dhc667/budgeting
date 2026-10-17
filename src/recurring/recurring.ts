import type { TFunction } from "i18next";
import type { Account } from "../accounts/account-queries";
import type { Transaction } from "../transactions/transaction-queries";
import { type RecurringTransaction, scheduleOf, type Upcoming } from "./recurring-queries";
import { nextDueDate, type Schedule } from "./schedule";

// Those due on or before `lastDay`, oldest first. A paused rule has none.
export function upcomingBy(rules: RecurringTransaction[], lastDay: string): Upcoming[] {
  return rules
    .flatMap((rule) => {
      const due = rule.paused ? null : nextDueDate(scheduleOf(rule), rule.done);
      return due !== null && due <= lastDay ? [{ rule, occurrence: rule.done, due }] : [];
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

// As the edit form shows it: from the next one due, with only what's left of its times.
export function shownSchedule(rule: RecurringTransaction, today: string): Schedule {
  const schedule = scheduleOf(rule);
  return {
    ...schedule,
    startsOn: nextDueDate(schedule, rule.done) ?? today,
    times: schedule.times === null ? null : Math.max(schedule.times - rule.done, 1),
  };
}

// An edit that leaves the schedule alone keeps counting from the start date, so that a rule on the
// 31st still comes back to it.
export function wasRescheduled(shown: Schedule, edited: Schedule): boolean {
  return (
    shown.startsOn !== edited.startsOn ||
    shown.every !== edited.every ||
    shown.unit !== edited.unit ||
    shown.endsOn !== edited.endsOn ||
    shown.times !== edited.times
  );
}

export function scheduleName({ every, unit }: Schedule, t: TFunction): string {
  switch (unit) {
    case "day":
      return t("recurring.every.day", { count: every });
    case "week":
      return t("recurring.every.week", { count: every });
    case "month":
      return t("recurring.every.month", { count: every });
    case "year":
      return t("recurring.every.year", { count: every });
  }
}

// What one of its transactions would look like, to show it as transactions are shown.
export function asTransaction(rule: RecurringTransaction, accounts: Account[]): Transaction {
  const { from, to } = sidesOf(rule, accounts);
  return {
    id: rule.id,
    date: rule.starts_on,
    title: rule.title,
    note: rule.note,
    created_by: rule.created_by,
    created_at: rule.created_at,
    type: rule.type,
    one_sided: false,
    from_account_id: from?.accountId ?? null,
    from_amount: from?.amount ?? null,
    from_currency: from?.currency ?? null,
    to_account_id: to?.accountId ?? null,
    to_amount: to?.amount ?? null,
    to_currency: to?.currency ?? null,
    category_id: rule.category_id,
    space_ids: [rule.space_id],
    search_text: "",
  };
}

function sidesOf(rule: RecurringTransaction, accounts: Account[]): { from?: Side; to?: Side } {
  const sideOf = (accountId: string | null, amount: number | null): Side | undefined => {
    const currency = accounts.find(({ id }) => id === accountId)?.currency;
    if (accountId === null || amount === null || currency === undefined) return undefined;
    return { accountId, amount, currency };
  };
  const account = sideOf(rule.account_id, rule.amount);
  switch (rule.type) {
    case "expense":
      return { from: account };
    case "refund":
    case "income":
      return { to: account };
    case "transfer": {
      const sameCurrency = sideOf(rule.to_account_id, rule.amount)?.currency === account?.currency;
      return {
        from: account,
        to: sideOf(rule.to_account_id, sameCurrency ? rule.amount : rule.to_amount),
      };
    }
  }
}

type Side = { accountId: string; amount: number; currency: string };
