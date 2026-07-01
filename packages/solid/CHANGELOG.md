# @roomful/solid

## 1.3.2

### Patch Changes

- Updated dependencies [5b11b46]
  - @roomful/core@1.4.0

## 1.3.1

### Patch Changes

- Updated dependencies [9d36007]
- Updated dependencies [233153b]
  - @roomful/core@1.3.0

## 1.3.0

### Minor Changes

- 56409b0: Add the framework bindings for session recording. Vue and Solid get a `useRecording()` composable/hook, Angular gets `injectRecording()`, and Svelte's `roomful()` adapter gains a `recording` store — each exposing reactive `isRecording` / `frameCount` / `durationMs` plus `start` / `stop` / `replay` / `exportRecording`, mirroring the adapter's existing engine bindings. Wraps `room.useRecording()` from `@roomful/core`.

### Patch Changes

- Updated dependencies [3ef72a4]
  - @roomful/core@1.2.0

## 1.2.1

### Patch Changes

- 3055e9e: Refresh package metadata for the v1.5 line: add npm descriptions to the packages that were missing them and update the README stable badge to v1.5. Documentation and metadata only -- no code or API changes.
- Updated dependencies [3055e9e]
  - @roomful/core@1.1.1

## 1.2.0

### Minor Changes

- 6172ae7: Add the Comments primitive (`room.useComments()` plus per-adapter bindings) — a v1.5 "new
  primitives" deliverable. Open collaborative threads anchored to an element, a canvas point, or a
  text-selection range: `add({ anchor, text })`, `thread(id).reply/resolve/reopen`, with `getAll`,
  `getByElement`, `getOpen`, and `subscribe`. Unlike the ephemeral primitives, comments are
  persistent collaborative state — threads ride the room's existing CRDT sync channel on a dedicated
  internal key, so they converge across peers and reach late joiners with no relay change and no
  collision with a user's `useSharedState`. The `'memory'` storage backend (the synced in-room
  structure) is implemented fully; `'indexeddb'` and `'rest'` add best-effort local persistence and a
  REST mirror on top of it. This changeset adds the core engine and the React `useComments()` hook;
  the remaining adapter bindings land as the primitive fans out across Vue, Svelte, Solid, and
  Angular.
- e886803: Add the History primitive (`room.useHistory()` plus per-adapter bindings) — a v1.5 "new primitives"
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
- f10f232: Add the Locking primitive (`room.useLocks()` plus per-adapter bindings) — a v1.5 "new
  primitives" deliverable. Claim exclusive, advisory ownership of any resource by string key:
  `acquire(key, { ttl, timeout })`, `release`, `releaseAll`, with `isLocked`, `getHolder`,
  `getAll`, `subscribe`, and `subscribeAll`. Locks are ephemeral (auto-release on disconnect, TTL
  expiry, or explicit release) and resolve deterministically across peers. Exposed as `useLocks()`
  and `useLockState(key)` in React, Vue, and Solid; `locks` and `lockState(key)` on the Svelte
  store; and `injectLocks()` and `injectLockState(key)` in Angular. Rides the existing event
  channel, so no relay change is required.
- b6f8bcc: Add the Pointer (laser pointer) primitive (`room.usePointer()` plus per-adapter bindings) — a
  v1.5 "new primitives" deliverable. Broadcast a transient "beam" at a peer's pointer position
  while active and drop it the moment they deactivate: `activate` and `deactivate` gate
  broadcasting, `mount(element)` tracks `mousemove` and broadcasts the normalized position, and
  `subscribe` plus `getAll` expose remote beams. A `PointerBeam` carries `peerId`, `name`, `color`,
  normalized `x`/`y` (0–1 of the container, resolution-independent like cursors and viewport), and
  `active`; the name and color are resolved from the peer's presence. A built-in zero-config
  `render({ container, style })` overlay draws each remote active beam, where `style` is one of
  `laser` (a glowing dot), `spotlight` (a soft radial dim), `crosshair` (thin cross lines), or
  `dot` (a plain dot). This release ships the core engine and the React `usePointer()` hook (which
  returns `ref`, `beams`, `activate`, `deactivate`, and `render`); the Vue, Svelte, Solid, and
  Angular bindings follow in the fan-out. It rides the existing event channel, so no relay change
  is required.
- 66eeac0: Add the Viewport Sync primitive (`room.useViewport()` plus per-adapter bindings) — the first
  v1.5 "new primitives" deliverable. Broadcast a peer's scroll/zoom and follow or present to
  others: `broadcast`/`stopBroadcast`, `present`/`stopPresenting`, `follow(peerId)`/`unfollow`,
  over a mounted container element with normalized (0–1) coordinates. Exposed as `useViewport()`
  in React/Vue/Solid, `viewport` on the Svelte `roomful()` store, and `injectViewport()` in
  Angular. It rides the existing event channel, so no relay change is required.

### Patch Changes

- Updated dependencies [6172ae7]
- Updated dependencies [e886803]
- Updated dependencies [f10f232]
- Updated dependencies [b6f8bcc]
- Updated dependencies [66eeac0]
  - @roomful/core@1.1.0

## 1.1.0

### Minor Changes

- bad9648: Add the SolidJS adapter (`@roomful/solid`), the first v1.1 "Ecosystem" deliverable.

  It mirrors the React adapter surface in idiomatic Solid: `RoomfulProvider` plus
  `useRoom`, `usePresence`, `useCursors`, `useAwareness`, `useEvent`, `usePeers`,
  `useConnectionStatus`, and `useSharedState`. State is reactive via Solid signals,
  and the same one-binding-per-room shared-state guard as the React and Vue adapters
  applies.
