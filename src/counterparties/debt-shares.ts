import { type Account, openAccountsIn } from "../accounts/account-queries";
import { groupBy } from "../group-by";
import type { Transaction } from "../transactions/transaction-queries";
import type { Counterparty } from "./read-counterparties";

// What's owed in each currency, shared out among the open accounts the debt moved through, newest
// first. Money paid back is taken to settle the oldest debt first, so when the accounts' shares add
// up to more than is owed, the oldest are cut.
export function debtShares(
  counterparty: Counterparty,
  transactions: Transaction[],
  accounts: Account[],
): CurrencyDebt[] {
  const open = openAccountsIn(accounts, counterparty.space_id);
  const moves = transactions.flatMap((transaction) => moveOf(transaction) ?? []);
  return counterparty.balances
    .filter(({ owed }) => owed !== 0)
    .map(({ currency, owed }) => {
      const shares = sharesOf(
        owed,
        moves.filter((move) => move.currency === currency),
        open.filter((account) => account.currency === currency),
      );
      return { currency, owed, shares };
    });
}

function sharesOf(owed: number, moves: Move[], accounts: Account[]): DebtShare[] {
  const towardOwed = (amount: number) => Math.sign(amount) === Math.sign(owed);
  const byAccount = [...groupBy(moves, ({ accountId }) => accountId)]
    .filter(([accountId]) => accounts.some(({ id }) => id === accountId))
    .map(([accountId, own]) => ({
      accountId,
      net: own.reduce((total, { amount }) => total + amount, 0),
      latest: own
        .filter(({ amount }) => towardOwed(amount))
        .reduce((latest, { date }) => (date > latest ? date : latest), ""),
    }))
    .filter(({ net }) => towardOwed(net))
    .sort((a, b) => b.latest.localeCompare(a.latest));

  let left = Math.abs(owed);
  const shares: DebtShare[] = [];
  for (const { accountId, net } of byAccount) {
    const amount = Math.min(Math.abs(net), left);
    if (amount === 0) break;
    shares.push({ accountId, amount });
    left -= amount;
  }
  // What moved through accounts that are gone or archived lands on another.
  const [first] = shares;
  const [fallback] = accounts;
  if (first) first.amount += left;
  else if (fallback) shares.push({ accountId: fallback.id, amount: left });
  return shares;
}

// How a transaction changed what the counterparty owes, in the debt's currency, through which
// account. A forgiven debt both leaves and reaches its account, so the side it leaves stands for it.
function moveOf(transaction: Transaction): Move | null {
  const { type, date, from_account_id, to_account_id, debt_amount, debt_currency } = transaction;
  const moved = (accountId: string | null, sign: 1 | -1) =>
    accountId === null || debt_amount === null || debt_currency === null
      ? null
      : { date, accountId, currency: debt_currency, amount: sign * debt_amount };
  switch (type) {
    case "given":
    case "forgiven":
      return moved(from_account_id, 1);
    case "forgave":
      return moved(from_account_id, -1);
    case "received":
      return moved(to_account_id, -1);
    case "expense":
    case "refund":
    case "income":
    case "transfer":
    case null:
      return null;
  }
}

type Move = { date: string; accountId: string; currency: string; amount: number };

// `owed` as the counterparty's balance has it: above zero, the counterparty owes the space. No
// shares when the space has no open account left in the currency.
export type CurrencyDebt = { currency: string; owed: number; shares: DebtShare[] };

// In minor units, above zero.
type DebtShare = { accountId: string; amount: number };
