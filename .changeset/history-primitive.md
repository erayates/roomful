---
'@roomful/core': minor
'@roomful/react': minor
'@roomful/vue': minor
'@roomful/svelte': minor
'@roomful/solid': minor
'@roomful/angular': minor
---

Add the History primitive (`room.useHistory()` plus per-adapter bindings) — a v1.5 "new primitives"
deliverable for collaborative undo. Undo and redo are per-peer and conflict-free: a `Y.UndoManager`
scoped to the local peer's transaction origin reverts only that peer's own mutations to the shared
CRDT document, so one peer's undo never destroys another peer's concurrent work. Wrap mutations in
`transaction(name, fn)` to capture them as one undoable unit, then call `undo()` and `redo()`, and
read the reactive `canUndo` and `canRedo` flags. Alongside undo lives a shared activity timeline:
every peer's `capture(action, payload)` and `transaction(name, fn)` appends a `TimelineEntry` (id,
author, action, timestamp, description) to a dedicated `Y.Array` root that converges across peers
and reaches late joiners over the existing CRDT sync channel, with no relay change and no collision
with a user's `useSharedState`. Entries are re-validated at read time so a malformed remote write
can never crash a reader, and each peer's timeline plus its local undo stack are bounded by
`maxEntries`. The surface is the reactive timeline and the capture, transaction, undo, redo,
canUndo, and canRedo controls, exposed as the React `useHistory()` hook, the Vue and Solid
`useHistory(options?)` composables, the Angular `injectHistory(options?)` function with `Signal`
timeline, and the Svelte `history` store on the `roomful()` return. Undo and redo act on the shared
CRDT document only; app-local component state and the `'lww'` state strategy are not auto-reverted,
so reverting those stays the app's responsibility.
