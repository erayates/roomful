---
'@roomful/angular': minor
---

Add the `injectFieldPresence` function (EP-15/16): returns a `Signal` of the active fields (which
remote peers are on which field) plus a `setActiveField(id | null)` control and `getFieldPeers(id)`.
Must run in an injection context. See `docs/reference/engines-field-presence.md`.
