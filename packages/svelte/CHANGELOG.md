# @roomful/svelte

## 1.5.4

### Patch Changes

- Updated dependencies
  - @roomful/core@2.0.0

## 1.5.3

### Patch Changes

- Updated dependencies [290c934]
  - @roomful/core@1.11.0

## 1.5.2

### Patch Changes

- Updated dependencies [7300eee]
- Updated dependencies [d6ea99d]
- Updated dependencies [9da3d61]
  - @roomful/core@1.10.0

## 1.5.1

### Patch Changes

- Updated dependencies [dbb633e]
- Updated dependencies [5138c44]
- Updated dependencies [bd210b1]
- Updated dependencies [a5fdc0e]
  - @roomful/core@1.9.0

## 1.5.0

### Minor Changes

- 589753f: Add the `agentApprovals` store binding for `room.useAgentApprovals`. The store is a readable of every proposal (newest first) augmented with a reactive `pending` sub-store and the `approve`, `reject`, and `propose` actions, so a Svelte UI can present an agent's proposed actions and let a human approve or reject them.

### Patch Changes

- Updated dependencies [7ffc235]
- Updated dependencies [9bd411a]
- Updated dependencies [c4369d9]
- Updated dependencies [bbba327]
- Updated dependencies [018f001]
  - @roomful/core@1.8.0

## 1.4.1

### Patch Changes

- 732172f: Release the `activity` store's subscribers on `roomful(...)` teardown. The adapter's destroy path
  clears every value store except `activityStore`, which was omitted when the activity store shipped —
  so its subscribers leaked past `destroy()`. Now cleared alongside the others.
- Updated dependencies [804681c]
  - @roomful/core@1.7.0

## 1.4.0

### Minor Changes

- 70f9691: Add the `fieldPresence` store (EP-15/16): the `roomful(...)` adapter now exposes a readable store of
  the active fields (which remote peers are on which field) with a `setActiveField(id | null)` control
  and a `getFieldPeers(id)` reader. See `docs/reference/engines-field-presence.md`.

### Patch Changes

- Updated dependencies [db6c216]
  - @roomful/core@1.6.0

## 1.3.0

### Minor Changes

- a233622: Add the `activity` store (EP-15): the `roomful(...)` adapter now exposes a readable store of the
  room activity feed (newest-first, referentially stable) with a `record(type, data?)` control, plus
  an `activity` factory option for the entry cap. See `docs/reference/engines-activity.md`.

### Patch Changes

- Updated dependencies [2dd0386]
- Updated dependencies [8f0c6ff]
- Updated dependencies [bc3f52c]
- Updated dependencies [0e9aa21]
- Updated dependencies [58d8843]
- Updated dependencies [8114214]
- Updated dependencies [6472822]
  - @roomful/core@1.5.0

## 1.2.2

### Patch Changes

- Updated dependencies [5b11b46]
  - @roomful/core@1.4.0

## 1.2.1

### Patch Changes

- Updated dependencies [9d36007]
- Updated dependencies [233153b]
  - @roomful/core@1.3.0

## 1.2.0

### Minor Changes

- 56409b0: Add the framework bindings for session recording. Vue and Solid get a `useRecording()` composable/hook, Angular gets `injectRecording()`, and Svelte's `roomful()` adapter gains a `recording` store — each exposing reactive `isRecording` / `frameCount` / `durationMs` plus `start` / `stop` / `replay` / `exportRecording`, mirroring the adapter's existing engine bindings. Wraps `room.useRecording()` from `@roomful/core`.

### Patch Changes

- Updated dependencies [3ef72a4]
  - @roomful/core@1.2.0

## 1.1.1

### Patch Changes

- 3055e9e: Refresh package metadata for the v1.5 line: add npm descriptions to the packages that were missing them and update the README stable badge to v1.5. Documentation and metadata only -- no code or API changes.
- Updated dependencies [3055e9e]
  - @roomful/core@1.1.1

## 1.1.0

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

## 1.0.1

### Patch Changes

- 6f4e1f5: Stable 1.0.1.
  - core: the `'custom'` shared-state strategy now syncs across peers, resolving conflicts via the
    user-provided `merge` function (previously it ran local-only and never propagated).
  - Drop beta framing now that 1.0 is stable: README/docs install commands no longer use the `@beta`
    tag, status badges read "stable", and the Docker examples use the `:latest` image tag.

- Updated dependencies [6f4e1f5]
  - @roomful/core@1.0.1

## 1.0.0

### Minor Changes

- fbd0751: API-freeze hardening for the stable 1.0.
  - Vue and Svelte adapters gain connection-status and error/lifecycle observation
    (useConnectionStatus / status store + onConnect/onDisconnect/onError), reaching parity with React.
  - Svelte state.shared now takes (key, options) with initialValue in options, matching useSharedState.
  - Removed the no-op Health stubs from core and react.
  - core/adapter-runtime is marked internal and excluded from the public API docs.
  - Relay CLI gains --cors-origin, --auth-secret, --max-room-size; Redis coordination is experimental.
  - Devtools ships the window.**roomful_devtools** typing, accepts the custom state strategy in its
    guard, and marks the bridge protocol experimental.
  - Documented non-exhaustive unions and merge-vs-replace engine semantics.

### Patch Changes

- 49c4c5e: Dedupe the framework adapters' shared runtime. The structural-equality checks
  (peers, cursors, awareness, deep value compare) and the single shared-state
  binding guards were copy-pasted across `@roomful/react`, `@roomful/vue`, and
  `@roomful/svelte`. They now live once in an internal `@roomful/core/adapter-runtime`
  module that each adapter imports. No public API or behavior change; each
  adapter's error wording is preserved.
- efdbbd0: Add react and @types/react as root devDependencies so the docs snippet
  validator can resolve react/jsx-runtime under a clean CI install. A stray
  react in the developer home directory masked the missing root dependency.
- 8ef5cd7: Fix the remaining release pipeline gates so packages can publish: ignore the
  changeset-generated .changeset/pre.json in prettier, and scope the root
  typecheck to packages so app-only TSX/Astro source no longer fails it.
- 343472a: Fix the release pipeline so the packages can publish. CI lints the framework
  adapters before building @roomful/core, and the @roomful/core/adapter-runtime
  subpath did not resolve pre-build, failing the lint gate. The base tsconfig now
  maps that subpath to source, so lint and typecheck resolve it without a build.
- 2361597: Skip the changeset status check during release when changesets pre mode is
  active. The release workflow ran changeset status on a tag-triggered shallow
  checkout, which has no main branch to diff against, so it failed right before
  publishing. In pre mode changeset files persist after versioning, so the
  existing empty-changeset guard never applied.
- c195284: Publish the relay Docker image under the erayatesdev/roomful namespace because
  Docker Hub no longer offers a free organization tier. No package code changes;
  this release re-runs the pipeline so the relay image publishes.
- Updated dependencies [fbd0751]
- Updated dependencies [49c4c5e]
- Updated dependencies [efdbbd0]
- Updated dependencies [8ef5cd7]
- Updated dependencies [343472a]
- Updated dependencies [2361597]
- Updated dependencies [c195284]
  - @roomful/core@1.0.0

## 1.0.0-beta.7

### Patch Changes

- 1aa3efa: Publish the relay Docker image under the erayatesdev/roomful namespace because
  Docker Hub no longer offers a free organization tier. No package code changes;
  this release re-runs the pipeline so the relay image publishes.
- Updated dependencies [1aa3efa]
  - @roomful/core@1.0.0-beta.7

## 1.0.0-beta.6

### Patch Changes

- 2361597: Skip the changeset status check during release when changesets pre mode is
  active. The release workflow ran changeset status on a tag-triggered shallow
  checkout, which has no main branch to diff against, so it failed right before
  publishing. In pre mode changeset files persist after versioning, so the
  existing empty-changeset guard never applied.
- Updated dependencies [2361597]
  - @roomful/core@1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- efdbbd0: Add react and @types/react as root devDependencies so the docs snippet
  validator can resolve react/jsx-runtime under a clean CI install. A stray
  react in the developer home directory masked the missing root dependency.
- Updated dependencies [efdbbd0]
  - @roomful/core@1.0.0-beta.5

## 1.0.0-beta.4

### Patch Changes

- 8ef5cd7: Fix the remaining release pipeline gates so packages can publish: ignore the
  changeset-generated .changeset/pre.json in prettier, and scope the root
  typecheck to packages so app-only TSX/Astro source no longer fails it.
- Updated dependencies [8ef5cd7]
  - @roomful/core@1.0.0-beta.4

## 1.0.0-beta.3

### Patch Changes

- Fix the release pipeline so the packages can publish. CI lints the framework
  adapters before building @roomful/core, and the @roomful/core/adapter-runtime
  subpath did not resolve pre-build, failing the lint gate. The base tsconfig now
  maps that subpath to source, so lint and typecheck resolve it without a build.
- Updated dependencies
  - @roomful/core@1.0.0-beta.3

## 1.0.0-beta.2

### Patch Changes

- 49c4c5e: Dedupe the framework adapters' shared runtime. The structural-equality checks
  (peers, cursors, awareness, deep value compare) and the single shared-state
  binding guards were copy-pasted across `@roomful/react`, `@roomful/vue`, and
  `@roomful/svelte`. They now live once in an internal `@roomful/core/adapter-runtime`
  module that each adapter imports. No public API or behavior change; each
  adapter's error wording is preserved.
- Updated dependencies [49c4c5e]
  - @roomful/core@1.0.0-beta.2

## 1.0.0

### Major Changes

Initial public release of `@roomful/svelte`, the Svelte adapter for Roomful.

- Reactive Svelte stores for presence, shared state, cursors, awareness, and events.
- Idiomatic Svelte bindings with an explicit `svelte` peer dependency contract.
- Workspace dependency on `@roomful/core`.
