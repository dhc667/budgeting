# Offline, a device can only add transactions

Supersedes ADR 0006. Without a connection, a user can record new expenses, incomes and transfers; every other change still needs the instance. New transactions wait on the device and are sent whenever the app is open and online, and the form works from the copy of accounts, categories and spaces the device last fetched. Adding is the one change that can't conflict with anyone else's: a new row with an id generated on the device collides with nothing, while offline edits, deletes, payments of upcoming transactions and changes to spaces would need merging that the family would have to understand.

## Considered options

- **Offline-first for everything** (a local copy of all data, every change queued): rejected for the reasons in ADR 0006. Members editing the same shared accounts make conflicts real, and resolving them would roughly double the work.
- **Background Sync** (the browser sends the queue with the app closed): not relied on, because iOS offers it to no web app. An iPhone sends its queue the next time the app is opened online.

## Consequences

- Sending a transaction twice saves it once, because its id was fixed on the device.
- The instance can still refuse a waiting transaction, for example when its account was archived or its author left the space. It stays on the device with the reason until the user fixes or discards it; nothing is dropped silently.
- Waiting transactions belong to the user who recorded them and survive an expired session. Signing out clears them along with the device's copy of the data, so it warns first when any are waiting.
- A transaction can wait through an app update, so a change to what a transaction holds must still send the ones recorded by the previous version.
- Two members can record the same purchase offline, and both are saved.
