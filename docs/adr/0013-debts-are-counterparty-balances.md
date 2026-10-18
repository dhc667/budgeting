# A debt is a counterparty's balance, not a loan with payments linked to it

Cashew records a loan as a special transaction that payments refer to, and stops counting it once marked paid. We store each counterparty as a ledger account (ADR 0002) instead: lending or paying back is money given to it, borrowing or being paid back is money received from it, and the debt is its balance in each currency. Money lent has to go somewhere for the books to balance; into an expense category it would count as spending until paid back, and left uncounted the account's balance would no longer match the money in it. Neither needs a stored link between a payment and its loan, which could disagree with the postings.

## Consequences

- A counterparty owes one running amount per currency, not a list of loans: lending more and being paid back in part are the same kind of movement, so "paid back" is read from the totals given and received.
- Money given or received stays within one space, like an expense (ADR 0007).
- A counterparty with transactions can't be deleted, since they'd be left with one side.
- Recurring transactions don't give or receive money yet.
