---
'@roomful/vue': minor
---

Add the `useFieldPresence` binding (EP-15/16): exposes a readonly ref to the active fields (which
remote peers are on which field) plus a `setActiveField(id | null)` control and `getFieldPeers(id)`.
See `docs/reference/engines-field-presence.md`.
