# Double-entry storage, with categories stored as accounts

Every transaction is stored as a header plus two or more postings, each moving an amount of one currency in or out of an account; within a currency, a transaction's postings sum to zero. Categories are stored as income and expense accounts, so an expense is a posting out of a bank account and a posting into a category. The UI never shows this: users see expenses, incomes and transfers, as in Cashew.

We chose this over Cashew's one-row-per-transaction model because transfers (including cross-currency ones, which keep both real amounts), split transactions and balance invariants then come out of one model instead of special cases.

## Consequences

- A cross-currency transfer does not balance in either currency alone; the zero-sum check applies only to transactions whose postings share a currency.
- A category that still has postings can't simply be deleted: its transactions must first be moved to another category, atomically, in the database.
- An account's starting money is recorded as an opening-balance transaction against a hidden system category that reports leave out, not as a stored balance. That way every balance is still the sum of its postings.
- Accounts with transactions are archived, never deleted; deleting one would leave the other side of its transfers pointing at nothing. For the same reason, a parent category can't be deleted while it has subcategories, and transactions can only move to a category of the same kind in the same space.
