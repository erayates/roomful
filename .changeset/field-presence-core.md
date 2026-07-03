---
'@roomful/core': minor
---

Add the field-presence engine (EP-15/16 / S14): `room.useFieldPresence()` reports which remote peers
are active on which field (a form input, table cell, or record attribute). `setActiveField(id)`
declares the local peer's field; `getFieldPeers(id)` / `getActiveFields()` return the remote peers
with live presence, and `subscribe` fires on change. Rides the awareness channel, so no relay change
is needed. Built for collaborative forms, tables, and admin records. See
`docs/reference/engines-field-presence.md`.
