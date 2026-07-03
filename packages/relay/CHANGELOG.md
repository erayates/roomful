# @roomful/relay

## 1.2.0

### Minor Changes

- 41a485f: Add production hardening controls to the relay server (EP-13): per-peer message rate limiting via
  `messageRateLimit` (a token bucket of `limit` messages refilling over `intervalMs`) and a
  `maxRooms` cap on the number of distinct rooms a relay instance will host. Excess messages are
  rejected with a `RATE_LIMITED` error and over-cap joins with `ROOM_LIMIT`, instead of being
  processed. Both are configurable from the `roomful-relay` CLI (`--max-rooms`,
  `--message-rate-limit`, `--message-rate-interval`) and the `ROOMFUL_MAX_ROOMS` /
  `ROOMFUL_MESSAGE_RATE_LIMIT` / `ROOMFUL_MESSAGE_RATE_INTERVAL_MS` environment variables. Both are
  off by default, so existing behaviour is unchanged.

## 1.1.0

### Minor Changes

- accc2a1: Add an edge-runtime relay for Cloudflare Workers + Durable Objects. A new runtime-agnostic `EdgeRoom` engine runs one room's relay protocol over any WebSocket-like connection, and `verifyRelayJwtEdge` provides Web Crypto (HS256) JWT verification for runtimes without `node:crypto`. The `cloudflare` entry wires these into a `RoomDurableObject` (one Durable Object per room, so no Redis coordinator is needed) plus a Worker that routes each room to its object; deploy with the included `wrangler.jsonc`. The existing Node `createRelayServer` is unchanged, and clients connect with the same relay protocol.

## 1.0.3

### Patch Changes

- 3055e9e: Refresh package metadata for the v1.5 line: add npm descriptions to the packages that were missing them and update the README stable badge to v1.5. Documentation and metadata only -- no code or API changes.

## 1.0.2

### Patch Changes

- 6ee0c76: Fix the `roomful-relay` CLI not starting the server when installed globally. The entrypoint
  detection compared `import.meta.url` against the symlinked `process.argv[1]` that
  `npm install -g` creates on Linux, so the server was never started (the process exited
  silently). It now compares resolved real paths via `realpathSync`.

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

## 1.0.0

### Major Changes

Initial public release of `@roomful/relay`, the self-hostable relay server for Roomful realtime transports.

- WebSocket signaling server with health checks and graceful reconnection support.
- Standalone CLI (`roomful-relay`) with runtime configuration.
- Inbound protocol validation via Zod `safeParse`.
- Official Docker image and Compose deployment assets.
- Optional Redis coordination for multi-instance deployments.
