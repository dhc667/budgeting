# Budgeting

A family budgeting app: each family tracks its accounts, income and expenses, in several currencies, with joint accounts shared between family members.

## Language

### People and access

**Instance**:
One family's deployment of the backend. Everyone in an instance can see each other.
_Avoid_: server, database, tenant

**Instance owner**:
The person who set up the instance and holds its credentials; the only one who can issue invite codes or reset passwords.
_Avoid_: admin

**User**:
A person who can sign in to an instance.
_Avoid_: account, member (when meaning a login)

**Invite code**:
A one-time, expiring code, issued by the instance owner and delivered as a QR code, that lets one person sign up as a user.
_Avoid_: token, invitation link

**Space**:
A group of users who share accounts, categories and budgets. Every member of a space has the same rights.
_Avoid_: household, group, workspace

**Private space**:
The space every user gets at signup. Its owner is its only member, forever: it can't be shared or deleted.

**Member**:
A user who belongs to a space.

### Money

**Account**:
A place where money is held, in a single currency, belonging to one space.
_Avoid_: wallet

**Archived account**:
An account hidden from lists and pickers but kept with its full history. Accounts that have transactions are archived, never deleted.

**Shared account**:
An account in a space with more than one member; a joint pot that every member can see and use. It is not a record of who owes whom.
_Avoid_: split, shared expense

**Category**:
A classification of income or expense, belonging to one space. Categories nest one level: a parent category may have subcategories, and a parent includes its subcategories wherever it is used.

**Opening balance**:
The transaction that records the money an account already held when it was added to the app. It is not income.

**Transaction**:
A single financial event: an expense, an income, or a transfer.
_Avoid_: entry, record

**Expense**:
A transaction that moves money out of an account into a category.

**Income**:
A transaction that moves money from a category into an account.

**Transfer**:
A transaction that moves money between two accounts, possibly in different currencies.

**Display currency**:
A user's chosen currency for viewing totals across accounts in different currencies.
_Avoid_: base currency, home currency

**Net worth**:
The sum of the balances of every account in the spaces a user belongs to, in their display currency. A shared account counts in full for each of its members.

### Planning

**Budget**:
A spending limit for one space, in one currency, over a fixed date range or a repeating period that starts on a day the budget chooses, covering chosen expense categories and accounts.

**Carry-over**:
Adjusting a budget's next-period limit by how the previous period ended. Each budget enables it separately for unspent money (raising the next limit) and for overspending (lowering it).
_Avoid_: rollover

**Recurring transaction**:
A rule that produces an upcoming transaction on a schedule.
_Avoid_: subscription, repeating transaction

**Upcoming transaction**:
A transaction a recurring transaction has produced but no member has marked paid or skipped. It does not affect balances until it is paid.
_Avoid_: pending, scheduled

### Oversight

**Activity**:
A space's record of every change made to its data: who made it, when, and what it was before.
_Avoid_: audit log, history
