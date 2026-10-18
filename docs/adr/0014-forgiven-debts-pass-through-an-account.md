# A forgiven debt passes through an account

Forgiving a debt moves what's owed out of the counterparty (ADR 0013) and into one of two categories every space has built in, Debts forgiven for spending and Debts forgiven to you for income. It also posts the amount into and out of one of the space's accounts, so the transaction has four postings: from the counterparty into the account, then out of the account into the category, or the other way round. The account's balance doesn't change, but the forgiveness belongs to it: it shows in that account's transactions, and a budget limited to that account counts it, as it would count the money if it had been paid back and then spent.

The user picks the account. A debt is one balance per currency, built from money that went through several accounts, so no account is the one a forgiveness belongs to. The app suggests one line per account the debt moved through, each with what went through it, and the user can split it further.

## Considered options

- **Counterparty straight to the category, no account**: two postings like every other transaction, but a budget limited to some accounts would never count a forgiveness, and no account's history would show where the money it lent went.
- **Hiding a counterparty instead of forgiving it**: its balance would still say it owes, and the money lent would never count as spent.
- **A category the user picks**: each forgiveness would ask for one, and nothing would stop it going into a category meant for something else.

## Consequences

- A transaction is no longer always two postings: `transaction_type` and the app read four postings with a counterparty, an account and a category as a forgiven debt.
- Built-in categories have no stored name; the app names them in its reader's language. They can't be renamed, deleted, nested or used by an expense or income.
- Money given and received on a counterparty leave out what was forgiven, so "paid back" counts only money that came back.
- A forgiveness can't exceed what's owed in its currency. Unlike money paid back, which can overshoot and turn the debt around, forgiving more than is owed would record spending or income that never happened.
