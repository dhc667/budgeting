import { memberOf } from "../supabase/json";
import type { TFunction } from "i18next";
import { ledgerAccountKinds, type Phrasing, stringAt } from "../spaces/activity";
import type { Activity } from "../activity/activity";
import { Constants, type Enums, type Json } from "../supabase/database.types";

export function describeTransactionChange(
  entry: Activity,
  actor: string,
  phrasing: Phrasing,
): string[] {
  const before = snapshotOf(entry.old);
  const after = snapshotOf(entry.new);
  const shown = after ?? before;
  if (!shown) return [];
  if (isOpeningBalance(shown)) return describeOpeningBalanceChange(entry, actor, shown, phrasing);
  const { t } = phrasing;
  const details = { actor, label: snapshotLabel(shown, t), summary: summarize(shown, phrasing) };
  switch (entry.action) {
    case "insert":
      return [t("activity.transaction.added", details)];
    case "delete":
      return [t("activity.transaction.deleted", details)];
    case "restore":
      return [t("activity.transaction.restored", details)];
    case "update":
      // An edit can move a transaction into or out of a space, which then has only one side.
      if (!before) return [t("activity.transaction.movedIn", details)];
      if (!after) return [t("activity.transaction.movedOut", details)];
      return describeTransactionEdit(before, after, actor, phrasing);
  }
}

// A transaction's deletion can be restored only while it is the newest entry about that
// transaction in the list, which comes newest first.
export function restorableDeletions(activity: Activity[]): Set<number> {
  const seen = new Set<string>();
  const restorable = new Set<number>();
  for (const entry of activity) {
    if (entry.table_name !== "transactions" || seen.has(entry.row_id)) continue;
    seen.add(entry.row_id);
    const deleted = snapshotOf(entry.old);
    if (entry.action === "delete" && deleted && !isOpeningBalance(deleted))
      restorable.add(entry.id);
  }
  return restorable;
}

function describeTransactionEdit(
  before: Snapshot,
  after: Snapshot,
  actor: string,
  phrasing: Phrasing,
): string[] {
  const { t } = phrasing;
  const label = snapshotLabel(after, t);
  const lines: string[] = [];
  if (before.title !== after.title)
    lines.push(
      t("activity.transaction.renamed", { actor, from: snapshotLabel(before, t), to: label }),
    );
  const was = summarize(before, phrasing);
  const now = summarize(after, phrasing);
  if (was !== now) lines.push(t("activity.transaction.changed", { actor, label, was, now }));
  if (before.note !== after.note)
    lines.push(t("activity.transaction.noteChanged", { actor, label }));
  return lines;
}

function describeOpeningBalanceChange(
  entry: Activity,
  actor: string,
  snapshot: Snapshot,
  { t, money, day }: Phrasing,
): string[] {
  const account = snapshot.postings.find(({ account_kind }) => account_kind === "account");
  if (!account) return [];
  const details = {
    actor,
    account: account.account_name,
    amount: money(account.amount, account.currency),
    date: day(snapshot.date),
  };
  switch (entry.action) {
    case "insert":
      return [t("activity.openingBalance.set", details)];
    case "update":
      return [t("activity.openingBalance.changed", details)];
    case "delete":
      return [t("activity.openingBalance.removed", details)];
    case "restore":
      return [];
  }
}

function isOpeningBalance(snapshot: Snapshot): boolean {
  return snapshot.postings.some(({ account_kind }) => account_kind === "opening_balance");
}

function snapshotLabel(snapshot: Snapshot, t: TFunction): string {
  const otherSide = snapshot.postings.find(
    ({ account_kind }) => isCategoryKind(account_kind) || account_kind === "counterparty",
  );
  return snapshot.title ?? otherSide?.account_name ?? t("transactions.transfer");
}

// What a space's members saw of a transaction: only their own side of a transfer from or to
// another space.
function summarize(snapshot: Snapshot, { t, money, day }: Phrasing): string {
  const accounts = snapshot.postings.filter(({ account_kind }) => account_kind === "account");
  const sent = accounts.find(({ amount }) => amount < 0);
  const received = accounts.find(({ amount }) => amount > 0);
  const category = snapshot.postings.find(({ account_kind }) => isCategoryKind(account_kind));
  const counterparty = snapshot.postings.find(
    ({ account_kind }) => account_kind === "counterparty",
  );
  const amountOf = (posting: Posting) => money(Math.abs(posting.amount), posting.currency);
  const date = day(snapshot.date);
  const moved = sent ?? received;
  if (!moved) return "";
  const withCategory = {
    amount: amountOf(moved),
    account: moved.account_name,
    category: category?.account_name ?? "",
    date,
  };
  const withCounterparty = {
    amount: amountOf(moved),
    account: moved.account_name,
    counterparty: counterparty?.account_name ?? "",
    date,
  };
  switch (snapshot.type) {
    case "expense":
      return t("activity.transaction.expense", withCategory);
    case "refund":
      return t("activity.transaction.refund", withCategory);
    case "income":
      return t("activity.transaction.income", withCategory);
    case "given":
      return t("activity.transaction.given", withCounterparty);
    case "received":
      return t("activity.transaction.received", withCounterparty);
    case "transfer":
      if (sent && received)
        return sent.currency === received.currency
          ? t("activity.transaction.transfer", {
              amount: amountOf(sent),
              from: sent.account_name,
              to: received.account_name,
              date,
            })
          : t("activity.transaction.transferExchanged", {
              amount: amountOf(sent),
              received: amountOf(received),
              from: sent.account_name,
              to: received.account_name,
              date,
            });
      return sent
        ? t("activity.transaction.transferToOtherSpace", {
            amount: amountOf(sent),
            from: sent.account_name,
            date,
          })
        : t("activity.transaction.transferFromOtherSpace", {
            amount: amountOf(moved),
            to: moved.account_name,
            date,
          });
    case null:
      return "";
  }
}

function snapshotOf(json: Json): Snapshot | null {
  if (json === null) return null;
  return {
    type: transactionTypes.find((type) => type === memberOf(json, "type")) ?? null,
    date: stringAt(json, "date") ?? "",
    title: stringAt(json, "title"),
    note: stringAt(json, "note"),
    postings: postingsOf(json),
  };
}

function isCategoryKind(kind: Enums<"ledger_account_kind">): boolean {
  return kind === "expense" || kind === "income";
}

function postingsOf(snapshot: Json): Posting[] {
  const postings = memberOf(snapshot, "postings");
  if (!Array.isArray(postings)) return [];
  return postings.flatMap((posting) => {
    const account_kind = ledgerAccountKinds.find(
      (kind) => kind === memberOf(posting, "account_kind"),
    );
    const account_name = stringAt(posting, "account_name") ?? "";
    const currency = stringAt(posting, "currency");
    const amount = memberOf(posting, "amount");
    if (account_kind === undefined || currency === null || typeof amount !== "number") return [];
    return [{ account_kind, account_name, currency, amount }];
  });
}

const transactionTypes = Constants.public.Enums.transaction_type;

type Snapshot = {
  type: Enums<"transaction_type"> | null;
  date: string;
  title: string | null;
  note: string | null;
  postings: Posting[];
};

type Posting = {
  account_kind: Enums<"ledger_account_kind">;
  account_name: string;
  currency: string;
  amount: number;
};
