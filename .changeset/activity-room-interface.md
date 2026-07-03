---
'@roomful/core': minor
---

Declare `useActivity` on the public `Room` interface (EP-15). The activity engine shipped on the
concrete room, but the interface method was omitted, so TypeScript callers typed as `Room` could not
reach it; `room.useActivity(options?)` is now part of the public type.
