---
'@roomful/core': minor
---

Add `createLocalStorageActivityStorage(roomId)` (EP-15): a Web Storage–backed
`ActivityStorageAdapter` for zero-server browser durability — the activity feed survives a reload
with no backend. Keyed per room (`roomful:<roomId>:activity`), versioned, and fails closed. Mirrors
the comments IndexedDB/localStorage backend. See `docs/reference/activity-storage.md`.
