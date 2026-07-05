# @roomful/core

## 1.11.0

### Minor Changes

- 290c934: Add ephemeral rooms (`ephemeral` option). Blocks durable persistence (state, comments storage), optionally auto-disconnects after a TTL. `room.getRemainingTime()` returns ms until expiry.

  Add `AuditLog` — a hash-chained, tamper-evident event log. `room.useAuditLog()` returns the log; room lifecycle events (connect, disconnect, peer join/leave) auto-record on first call. `log.verify()` detects tampering.

  Add `docs/reference/security.md` covering threat model, encryption, relay trust, data retention, auth, and audit trail.

## 1.10.0

### Minor Changes

- 7300eee: Complete the room diagnostics inspection surface with locks and comments. `room.getDiagnostics()` now reports a `locks` section (`heldCount`, `heldKeys`) and a `comments` section (`threadCount`, `openCount`), so all six inspectable categories (peers, state, locks, comments, events, transports) are covered. Both read from the lock/comments engines only if the room ever used them (no forced instantiation). Exports the new `RoomDiagnosticsLocks` and `RoomDiagnosticsComments` types.
- d6ea99d: Add an error catalog. `ROOMFUL_ERROR_CATALOG` maps every `RoomfulErrorCode` to a `{ title, description, remediation, recoverable }` entry, and `describeRoomfulError(code)` looks one up — so an app can turn a thrown `RoomfulError` into an actionable message. The catalog is typed as an exhaustive record (a new code is a compile error until documented). Exports `ErrorCatalogEntry`. The codes are also documented in `docs/reference/errors.md`.
- 9da3d61: Add `room.getUsageMetrics()` for telemetry. Unlike the point-in-time `getDiagnostics()` snapshot, it returns cumulative counters for the room's lifetime that survive reconnects — `connectCount` (sessions), `reconnectCount`, `peakRemotePeerCount`, and message counters (`messagesSent`/`messagesReceived`/`broadcastsSent`/`directSends`) — so an app can feed room usage to analytics. Exports the new `UsageMetrics` type.

## 1.9.0

### Minor Changes

- dbb633e: Add privacy controls to session recording. `room.useRecording(options?)` now accepts a `redact` hook that runs on every captured frame before it is stored — return the frame (with its cloned `signal` masked in place) to keep it, or `null` to drop it entirely, so sensitive data never enters the recording. Exports the new `RecordingOptions` type.
- 5138c44: Add a recording retention cap. `room.useRecording({ maxFrames })` keeps only the most recent `maxFrames` frames, dropping the oldest first, so a long-running capture holds a bounded sliding window instead of growing without limit. Pairs with the `redact` hook as a data-retention policy: `redact` controls what is recorded, `maxFrames` controls how much is kept.
- bd210b1: Add `ReplaySession.seek(index)` for a scrubbable replay timeline. It pauses playback and re-emits every frame from the start up to `index`, so a listener that applies frames (e.g. `applyReplaySignal`) rebuilds the state at that point — enabling time-travel scrubbing of a recorded session. `index` is clamped to `[0, frameCount]`.
- a5fdc0e: Formalize the `.roomful` session format. New `parseRoomfulRecording(value)` validates a value loaded from a `.roomful` file into a `RoomfulRecording` — checking the version, the envelope fields, and every frame's signal (through the same transport-signal parser the live wire path uses) — or returns `null` for a malformed or unsupported-version file, so a bad file can never reach `replay()`. Exports `parseRoomfulRecording` and `RECORDING_FORMAT_VERSION`. The format is documented in `docs/reference/roomful-format.md` (schema, versioning, compression guidance).

## 1.8.0

### Minor Changes

- 7ffc235: Add a structured agent action stream. AI peers can now log their actions to the room's activity feed — auditable, replayable, and synced to every peer. New `context.recordAction(type, payload?)` records an explicit action; the new `recordActions` option on `addAIPeer` auto-records the semantic actions an agent takes (events it emits, presence patches it applies). Read the log back anywhere with `getAgentActions(entries)` (exported with `AGENT_ACTION_PREFIX`), which filters an activity feed down to agent-authored entries. Reuses the existing activity engine — no new wire protocol.
- 9bd411a: Add a human-in-the-loop agent approval workflow. Agents can now `propose` an action instead of applying it, and humans `approve` or `reject` it — so AI actions are inspectable before they commit. New `room.useAgentApprovals(options?)` engine (propose/approve/reject/getProposals/getPending/subscribe) rides a reserved event channel and syncs proposals to every peer, with a `canDecide` permission hook. AI peers get a `context.propose(type, payload?)` action (which sets the `waiting-approval` state) and see live proposals via `context.proposals`, so an agent can apply an action once it's approved. Exports `AgentProposal`, `AgentProposalStatus`, `AgentApprovalEngine`, and `AgentApprovalOptions`.
- c4369d9: Add live agent presence states. An AI peer now announces what it is doing — `idle`, `thinking`, `typing`, `editing`, or `waiting-approval` — via a new `context.setState(...)` action that rides presence (no protocol change). Read it from any peer with `getAgentState(peer)` (exported alongside the `AgentState` type and `AGENT_STATE_KEY`). `createHeuristicAgent` now announces a lifelike state each tick, so demos show a live "thinking…/typing…" indicator out of the box.
- bbba327: Add an AI agent identity model. `addAIPeer` now stamps every AI peer with a detectable identity that rides the presence channel (no protocol change), and a new `identity` option declares its `role`/`disclosure`. Any peer can detect and describe an agent with the new `isAgentPeer(peer)` / `getAgentIdentity(peer)` helpers (exported alongside `AgentIdentity` and `AGENT_IDENTITY_KEY`). This is the foundation for agent-aware UIs and downstream agent collaboration features.
- 018f001: Add an alpha session summarizer. `summarizeSession(entries, options?)` turns a room's activity feed into a structured, replayable rollup — participants (most active first, agents flagged), per-type action counts, agent vs human counts, time span, and a summary line. Pass a `narrate` hook to render the text with an LLM, or use the built-in heuristic. Exports `SessionSummary`, `SessionParticipant`, and `SessionSummarizerOptions`. Alpha: the shape may change in a minor release. See `docs/reference/session-summarizer.md`.

## 1.7.0

### Minor Changes

- 804681c: Fix durable comments losing replies and the resolved flag on reload, and export
  `createLocalStorageCommentsStorage(roomId)`.

  The `storage: 'indexeddb'` backend restored each persisted thread by re-adding its root text
  (`commentsEngine.add({ anchor, text })`) — which minted a fresh id, dropped every reply, and reset
  `resolved` to `false`. So a reload silently lost all replies and reopened resolved threads. The
  backend now uses a Web Storage–backed `CommentsStorageAdapter` (the same one now exported as
  `createLocalStorageCommentsStorage`), so threads restore in full through the engine's own hydrate
  path. `useComments({ storageAdapter })` was already correct.

## 1.6.0

### Minor Changes

- db6c216: Add the field-presence engine (EP-15/16 / S14): `room.useFieldPresence()` reports which remote peers
  are active on which field (a form input, table cell, or record attribute). `setActiveField(id)`
  declares the local peer's field; `getFieldPeers(id)` / `getActiveFields()` return the remote peers
  with live presence, and `subscribe` fires on change. Rides the awareness channel, so no relay change
  is needed. Built for collaborative forms, tables, and admin records. See
  `docs/reference/engines-field-presence.md`.

## 1.5.0

### Minor Changes

- 2dd0386: Add the activity engine (EP-15 / S14): `room.useActivity()` exposes a shared, bounded, newest-first
  feed of room activity. `record(type, data?)` broadcasts an entry to every peer over the reserved
  event channel; `getEntries()` returns the feed newest first (de-duplicated by id, capped at `limit`,
  default 100), and `subscribe` fires on every change. Entries carry the actor peer with live presence.
  Content-agnostic — record comment, lock, or any app events. See `docs/reference/engines-activity.md`.
- 8f0c6ff: Add `createLocalStorageActivityStorage(roomId)` (EP-15): a Web Storage–backed
  `ActivityStorageAdapter` for zero-server browser durability — the activity feed survives a reload
  with no backend. Keyed per room (`roomful:<roomId>:activity`), versioned, and fails closed. Mirrors
  the comments IndexedDB/localStorage backend. See `docs/reference/activity-storage.md`.
- bc3f52c: Declare `useActivity` on the public `Room` interface (EP-15). The activity engine shipped on the
  concrete room, but the interface method was omitted, so TypeScript callers typed as `Room` could not
  reach it; `room.useActivity(options?)` is now part of the public type.
- 0e9aa21: Add durable activity storage (EP-15): `ActivityStorageAdapter` + `createMemoryActivityStorage`, and
  an `storageAdapter` option on `room.useActivity({ storageAdapter })`. When set, the feed is restored
  on startup (merged, de-duplicated by id) and saved after every change, so activity survives
  reconnects and reloads. Best-effort: a failed load/save never breaks the live feed. See
  `docs/reference/activity-storage.md`.
- 58d8843: Extend comment anchors (EP-15 / #152): a `CommentAnchor` can now pin a thread to a record
  (`{ recordId }`), a field within a record (`{ recordId, fieldId }`, e.g. a table cell), a standalone
  form field (`{ fieldId }`), or a tree/graph node (`{ nodeId }`) — alongside the existing element,
  point, and text-range anchors. This enables collaborative comments on forms, tables, and node
  graphs. Anchors are validated on `add` and round-trip through sync and storage unchanged.
- 8114214: Expose the comments storage adapter through the public API (EP-15 / S13): `useComments` now accepts
  a `storageAdapter` option, so custom durable comments (Postgres, SQLite, or any backend) can be
  configured without touching engine internals. Threads restore from the adapter on startup and save
  after every change; it composes with the default in-memory backend. See
  `docs/reference/comments-storage.md`.
- 6472822: Add a `CommentsStorageAdapter` contract and a `createMemoryCommentsStorage` reference adapter for
  durable comments (EP-15). When the comments engine is given a storage adapter, threads are restored
  from it on startup — into an otherwise-empty room, so the live CRDT is never clobbered — and saved
  after every change, so comments survive reconnects and reloads. Back the adapter with Postgres,
  SQLite, or any store; see `docs/reference/comments-storage.md`. Persistence is best-effort and never
  blocks the live, CRDT-synced comments.

## 1.4.0

### Minor Changes

- 5b11b46: Add a WebTransport transport, selectable with `transport: 'webtransport'`. It carries the existing relay wire protocol over an HTTP/3 bidirectional stream via a length-prefix framing shim, reusing the WebSocket relay handshake and protocol negotiation unchanged. Opt-in only — `auto` does not select it yet. Requires an `https://` `relayUrl` and a WebTransport-capable relay.

## 1.3.0

### Minor Changes

- 9d36007: Add `addAIPeer(roomId, options)` — attach a headless, programmatically-driven ("AI") peer to a room. It joins as a second participant over the room's transport and a pluggable `agent` drives its presence, cursor, and events on a tick loop; it runs in a browser tab, Node, or a server (no DOM). Ships `createHeuristicAgent()` for a zero-dependency demo bot (wandering cursor + reactions + rotating mood) — pair `addAIPeer` with an LLM-backed agent for real intelligence. The demo gains an "Add AI teammate" button that drops the bot into whichever mini-app is active.
- 233153b: Add `room.applyReplaySignal(signal)` — feed a recorded wire signal back through the room's inbound pipeline to reconstruct presence, cursors, and shared state. This enables **visual session replay**: stream a recording's frames into a throwaway offline room (each signal carries its original `fromPeerId`, so every participant is rebuilt) and render the reconstructed state. The demo's Session recorder now replays visually — a sandbox room rebuilds the cursors at the original tempo — instead of streaming a raw signal log.

## 1.2.0

### Minor Changes

- 3ef72a4: Add session recording. `room.useRecording()` (core) captures a room's wire signals at the transport boundary — local to the peer, riding no relay change — then replays them at their original tempo or exports them as a portable `.roomful` recording. The React adapter exposes the same surface through the `useRecording()` hook: reactive `isRecording`/`frameCount`/`durationMs` plus stable `start`/`stop`/`replay`/`exportRecording` controls.

## 1.1.1

### Patch Changes

- 3055e9e: Refresh package metadata for the v1.5 line: add npm descriptions to the packages that were missing them and update the README stable badge to v1.5. Documentation and metadata only -- no code or API changes.

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

## 1.0.1

### Patch Changes

- 6f4e1f5: Stable 1.0.1.
  - core: the `'custom'` shared-state strategy now syncs across peers, resolving conflicts via the
    user-provided `merge` function (previously it ran local-only and never propagated).
  - Drop beta framing now that 1.0 is stable: README/docs install commands no longer use the `@beta`
    tag, status badges read "stable", and the Docker examples use the `:latest` image tag.

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

## 1.0.0-beta.7

### Patch Changes

- 1aa3efa: Publish the relay Docker image under the erayatesdev/roomful namespace because
  Docker Hub no longer offers a free organization tier. No package code changes;
  this release re-runs the pipeline so the relay image publishes.

## 1.0.0-beta.6

### Patch Changes

- 2361597: Skip the changeset status check during release when changesets pre mode is
  active. The release workflow ran changeset status on a tag-triggered shallow
  checkout, which has no main branch to diff against, so it failed right before
  publishing. In pre mode changeset files persist after versioning, so the
  existing empty-changeset guard never applied.

## 1.0.0-beta.5

### Patch Changes

- efdbbd0: Add react and @types/react as root devDependencies so the docs snippet
  validator can resolve react/jsx-runtime under a clean CI install. A stray
  react in the developer home directory masked the missing root dependency.

## 1.0.0-beta.4

### Patch Changes

- 8ef5cd7: Fix the remaining release pipeline gates so packages can publish: ignore the
  changeset-generated .changeset/pre.json in prettier, and scope the root
  typecheck to packages so app-only TSX/Astro source no longer fails it.

## 1.0.0-beta.3

### Patch Changes

- Fix the release pipeline so the packages can publish. CI lints the framework
  adapters before building @roomful/core, and the @roomful/core/adapter-runtime
  subpath did not resolve pre-build, failing the lint gate. The base tsconfig now
  maps that subpath to source, so lint and typecheck resolve it without a build.

## 1.0.0-beta.2

### Patch Changes

- 49c4c5e: Dedupe the framework adapters' shared runtime. The structural-equality checks
  (peers, cursors, awareness, deep value compare) and the single shared-state
  binding guards were copy-pasted across `@roomful/react`, `@roomful/vue`, and
  `@roomful/svelte`. They now live once in an internal `@roomful/core/adapter-runtime`
  module that each adapter imports. No public API or behavior change; each
  adapter's error wording is preserved.

## 1.0.0

### Major Changes

Initial public release of `@roomful/core`, the framework-agnostic TypeScript core for Roomful collaboration.

- Room lifecycle and peer registry with deterministic join/leave ordering.
- Collaboration engines: presence, live cursors, shared state, awareness, and typed events.
- CRDT/Yjs support for conflict-heavy shared state with late-joiner bootstrapping.
- Transports: BroadcastChannel, in-memory, polling, WebSocket relay, and WebRTC.
- Optional AES-GCM end-to-end encryption.
- Offline mutation queueing and reconnection behavior.
- `RoomfulError` runtime error class and boundary-safe (`unknown`) event payloads.
- Browser DevTools bridge for inspecting peers, events, and state diffs.
