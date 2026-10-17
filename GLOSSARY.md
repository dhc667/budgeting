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
A person who can sign in to an instance. A user who has changed anything in a space can't be deleted.
_Avoid_: account, member (when meaning a login)

**Profile**:
A user's name and display currency, visible to everyone in the instance, plus their language and how numbers and dates look. Each of those three can be left on Automatic, which follows the device.

**Invite code**:
A one-time, expiring code, issued by the instance owner and delivered as a QR code, that lets one person sign up as a user.
_Avoid_: token, invitation link

**Space**:
A group of users who share accounts, categories and budgets. Every member of a space has the same rights.
_Avoid_: household, group, workspace

**Private space**:
The space every user gets at signup, always named Private. Its owner is its only member, forever: it can't be shared, renamed or deleted.

**Shared space**:
A space any user can create and add other users of the instance to; they're members at once. Its last member can't leave, and it can be deleted only while it holds no transactions other than opening balances.

**Member**:
A user who belongs to a space.

**Space picker**:
The spaces whose data the app shows: all of a user's spaces unless they narrow it. It changes what the user sees, never what they can record into.
_Avoid_: space switcher, current space

### Money

**Account**:
A place where money is held, in a single currency, belonging to one space for good.
_Avoid_: wallet

**Archived account**:
An account hidden from lists and pickers but kept with its full history, and still counted in net worth. It takes no new transactions, though the ones it has can still be edited. Accounts that have transactions other than their opening balance are archived, never deleted.

**Shared account**:
An account in a space with more than one member; a joint pot that every member can see and use. It is not a record of who owes whom.
_Avoid_: split, shared expense

**Category**:
A classification of income or expense, belonging to one space. Each category is either an expense category or an income category; that decides where it appears, not which way money can move through it. Categories nest one level: a parent category may have subcategories, and a parent includes its subcategories wherever it is used. A subcategory always has its parent's kind, so moving it under a parent of the other kind, or changing its parent's kind, changes its own. Deleting a category moves its transactions to another category of the same kind in the same space. Every new space starts with a set of categories its members can change, named in the language the app was showing its creator; after that they are plain names that don't follow anyone's language.

**Opening balance**:
The transaction that records the money an account already held when it was added to the app. It is not income.

**Transaction**:
A single financial event: an expense, an income, or a transfer. It happens on a day, never a future one, and may have a title saying what it was for and a note.
_Avoid_: entry, record

**Expense**:
A transaction that moves money out of an account into an expense category.

**Refund**:
An expense in reverse: money coming back from an expense category into an account. It lowers that category's spending instead of counting as income.

**Income**:
A transaction that moves money from a category into an account.

**Transfer**:
A transaction that moves money between two accounts, possibly in different currencies and different spaces. Only someone who belongs to both spaces can change, delete or restore a transfer between them; anyone else sees just their side, coming from or going to another space.

**Unsynced transaction**:
A transaction recorded on a device without a connection that the instance hasn't accepted yet. It counts in that device's balances and can be changed or discarded until it is sent. One the instance refuses stays unsynced, with the reason, until it is fixed or discarded.
_Avoid_: pending, queued, offline transaction

**Display currency**:
A user's chosen currency for viewing totals across accounts in different currencies.
_Avoid_: base currency, home currency

**Exchange rate**:
How many units of a currency one US dollar buys, stored for each day it was published and shared by the whole instance. A date's rate is the latest one on or before it, so weekends and holidays have none of their own. A currency's latest rate is stale when it is more than 7 days older than the newest rate of any currency; a stale rate is still used, but is shown with its date. A display currency must have a rate that isn't stale. The instance owner can load a currency's rates by hand, and the app then never saves any for it.

**Net worth**:
The sum of the balances of every account in the spaces a user belongs to, in their display currency. A shared account counts in full for each of its members.

### Planning

**Budget**:
A spending limit for one space, in one currency, over a fixed date range or a repeating period that starts on a day the budget chooses, covering chosen expense categories and accounts. It tracks net spending: what went into its categories minus refunds.

**Carry-over**:
Adjusting a budget's next-period limit by how the previous period ended. Each budget enables it separately for unspent money (raising the next limit) and for overspending (lowering it).
_Avoid_: rollover

**Recurring transaction**:
A rule that produces an upcoming transaction on a schedule.
_Avoid_: subscription, repeating transaction

**Upcoming transaction**:
A transaction a recurring transaction has produced but no member has recorded or skipped yet. It does not affect balances until it is recorded, as a transaction of its own.
_Avoid_: pending, scheduled

### Oversight

**Activity**:
A space's record of every change made to its data: who made it, when, and what it was before. A deleted transaction can be restored from it, unless an account it used is gone or now holds another currency; if its category was deleted since, it goes where that category's transactions went. The categories a space starts with aren't in it, and deleting a category is a single change that says where its transactions went, not one per transaction moved.
_Avoid_: audit log, history
