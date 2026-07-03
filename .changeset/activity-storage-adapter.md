---
'@roomful/core': minor
---

Add durable activity storage (EP-15): `ActivityStorageAdapter` + `createMemoryActivityStorage`, and
an `storageAdapter` option on `room.useActivity({ storageAdapter })`. When set, the feed is restored
on startup (merged, de-duplicated by id) and saved after every change, so activity survives
reconnects and reloads. Best-effort: a failed load/save never breaks the live feed. See
`docs/reference/activity-storage.md`.
