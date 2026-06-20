# @cahoots/core

## 1.0.0

### Major Changes

Initial public release of `@cahoots/core`, the framework-agnostic TypeScript core for Cahoots collaboration.

- Room lifecycle and peer registry with deterministic join/leave ordering.
- Collaboration engines: presence, live cursors, shared state, awareness, and typed events.
- CRDT/Yjs support for conflict-heavy shared state with late-joiner bootstrapping.
- Transports: BroadcastChannel, in-memory, polling, WebSocket relay, and WebRTC.
- Optional AES-GCM end-to-end encryption.
- Offline mutation queueing and reconnection behavior.
- `CahootsError` runtime error class and boundary-safe (`unknown`) event payloads.
- Browser DevTools bridge for inspecting peers, events, and state diffs.
