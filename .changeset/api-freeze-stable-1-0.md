---
'@roomful/core': minor
'@roomful/react': minor
'@roomful/vue': minor
'@roomful/svelte': minor
'@roomful/devtools': minor
'@roomful/relay': minor
'@roomful/cursors': patch
---

API-freeze hardening for the stable 1.0.

- Vue and Svelte adapters gain connection-status and error/lifecycle observation
  (useConnectionStatus / status store + onConnect/onDisconnect/onError), reaching parity with React.
- Svelte state.shared now takes (key, options) with initialValue in options, matching useSharedState.
- Removed the no-op Health stubs from core and react.
- core/adapter-runtime is marked internal and excluded from the public API docs.
- Relay CLI gains --cors-origin, --auth-secret, --max-room-size; Redis coordination is experimental.
- Devtools ships the window.__roomful_devtools__ typing, accepts the custom state strategy in its
  guard, and marks the bridge protocol experimental.
- Documented non-exhaustive unions and merge-vs-replace engine semantics.
