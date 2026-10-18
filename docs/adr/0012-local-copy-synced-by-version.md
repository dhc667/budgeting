# Each device keeps a local copy, pulled from the instance by version

The app keeps a copy of everything the signed-in user can see in IndexedDB, and every screen reads from it. Balances, budgets, activity and reports are worked out in TypeScript over that copy instead of in SQL. Writes still go through the instance's functions, which enforce the rules whoever calls them; the device then pulls the change back like anyone else's.

A device sends the version it last received and gets every row it can see that changed since, the rows deleted since, the ids of its spaces and a new version, all from one snapshot. The instance-wide tables (currencies, exchange rates, profiles) sync the same way and are visible to every user.

- A shared trigger sets each row's `version` to the writing Postgres transaction's id. Writing a transaction's postings also stamps the transaction, since a posting can make it visible to someone new.
- The provider publishes a rate for every currency each day and history is backfilled to the oldest transaction, so sending every rate would grow by tens of thousands of rows a year. A device receives the full rate history only for the currencies it uses (those of the money accounts and budgets it can see, and its own display currency), and for any other currency only its latest rate. The pull lists those currencies as `rate_currencies`.
- A deleted row leaves its table, key and version behind, readable by any user: a key is a random id that tells another space nothing.
- The version handed out is the oldest Postgres transaction still running at the snapshot (`pg_snapshot_xmin`), so nothing committed later can carry a lower one. Rows above it may be sent again, which is harmless: a pulled row replaces the device's copy.
- The device drops its copy and pulls everything again when its spaces or its currencies change (joining or leaving a space changes what Row Level Security lets through, and starting to use a currency makes its rate history visible, both without writing rows), when the schema version changes, or when its version is ahead of what the instance has handed out, as after a restore to an earlier point in time.
- A device pulls when the app starts, when the connection returns, when the app comes back to the foreground and after each of its own writes. The copy belongs to one user on one instance; signing out deletes it.

## Considered options

- **Query cache saved to IndexedDB**: reports and budgets need every posting and rate, so each refetch would download them all again.
- **A counter row every write increments**: functions such as `lock_changeable_transaction` and `lock_rule` lock a row with `for update` before writing, so a counter locked at each write would be taken in different orders by different writes and could deadlock. The watermark needs no lock.
- **`updated_at` timestamps**: taken before commit, so a slow Postgres transaction can commit a row older than one a device already has.
- **Append-only change log**: it grows forever and needs compacting.
- **PowerSync or ElectricSQL**: a sync service beside the database, a second piece of infrastructure per family that ADR 0001 avoids.

## Consequences

- ADR 0011 rejected offline changes that need merging. Here the copy is only read, writes still go to the instance, and offline still only adds transactions. It widens 0011's "copy of accounts, categories and spaces the device last fetched" to everything the user can see.
- The SQL that only serves reads (views, `budget_spending`, `title_suggestions`, the functions that read a row's activity) is dropped in a later migration, once no deployed app calls it, so that an instance migrated before the deploy finishes keeps working (#7).
- A change another member makes shows on a device at its next pull, not the moment it is made.
- The first pull downloads everything, the activity included. A family's data is small enough for this.
- A Postgres transaction left open holds the version back, so until it ends every pull sends again the rows written since it started. Harmless, but wasteful.
- Postings are never moved to an account in another space, only rewritten, so a user whose side of a transaction goes away receives its deletion. The device drops a transaction it holds no postings for.
