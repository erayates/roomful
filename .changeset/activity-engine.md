---
'@roomful/core': minor
---

Add the activity engine (EP-15 / S14): `room.useActivity()` exposes a shared, bounded, newest-first
feed of room activity. `record(type, data?)` broadcasts an entry to every peer over the reserved
event channel; `getEntries()` returns the feed newest first (de-duplicated by id, capped at `limit`,
default 100), and `subscribe` fires on every change. Entries carry the actor peer with live presence.
Content-agnostic — record comment, lock, or any app events. See `docs/reference/engines-activity.md`.
