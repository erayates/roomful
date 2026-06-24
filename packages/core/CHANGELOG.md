# @roomful/core

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
