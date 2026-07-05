---
'@roomful/core': minor
---

Complete the room diagnostics inspection surface with locks and comments. `room.getDiagnostics()` now reports a `locks` section (`heldCount`, `heldKeys`) and a `comments` section (`threadCount`, `openCount`), so all six inspectable categories (peers, state, locks, comments, events, transports) are covered. Both read from the lock/comments engines only if the room ever used them (no forced instantiation). Exports the new `RoomDiagnosticsLocks` and `RoomDiagnosticsComments` types.
