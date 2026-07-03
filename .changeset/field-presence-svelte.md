---
'@roomful/svelte': minor
---

Add the `fieldPresence` store (EP-15/16): the `roomful(...)` adapter now exposes a readable store of
the active fields (which remote peers are on which field) with a `setActiveField(id | null)` control
and a `getFieldPeers(id)` reader. See `docs/reference/engines-field-presence.md`.
