---
'@roomful/angular': minor
---

Add the `injectActivity` function (EP-15): returns a `Signal` of the room activity feed
(newest-first, reactive, referentially stable) plus a `record(type, data?)` control. Must run in an
injection context. See `docs/reference/engines-activity.md`.
