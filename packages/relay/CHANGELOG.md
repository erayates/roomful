# @roomful/relay

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
