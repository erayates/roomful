---
'@roomful/svelte': minor
---

Add the `activity` store (EP-15): the `roomful(...)` adapter now exposes a readable store of the
room activity feed (newest-first, referentially stable) with a `record(type, data?)` control, plus
an `activity` factory option for the entry cap. See `docs/reference/engines-activity.md`.
