# Online-only, with no local store or sync

The app keeps no local copy of the data and needs a connection to record anything; offline, it says so. An offline-first design (IndexedDB plus a sync queue with conflict resolution) would roughly double the work, and family members logging into the same shared accounts would make conflicts real. This can be revisited, but adding it later means building that sync layer under an app that assumed it didn't exist.
