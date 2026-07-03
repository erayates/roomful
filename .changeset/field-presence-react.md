---
'@roomful/react': minor
---

Add the `useFieldPresence` hook (EP-15/16): returns `{ fields, setActiveField, getFieldPeers }` — the
reactive list of fields with remote peers, a stable `setActiveField(id | null)` to declare the local
peer's field (e.g. on focus/blur), and `getFieldPeers(id)` to read the current snapshot. See
`docs/reference/engines-field-presence.md`.
