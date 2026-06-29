---
'@roomful/core': minor
'@roomful/react': minor
'@roomful/vue': minor
'@roomful/svelte': minor
'@roomful/solid': minor
'@roomful/angular': minor
---

Add the Locking primitive (`room.useLocks()` plus per-adapter bindings) — a v1.5 "new
primitives" deliverable. Claim exclusive, advisory ownership of any resource by string key:
`acquire(key, { ttl, timeout })` / `release` / `releaseAll`, with `isLocked` / `getHolder` /
`getAll` and `subscribe` / `subscribeAll`. Locks are ephemeral (auto-release on disconnect, TTL
expiry, or explicit release) and resolve deterministically across peers. Exposed as `useLocks()`

- `useLockState(key)` in React/Vue/Solid, `locks` + `lockState(key)` on the Svelte store, and
  `injectLocks()` + `injectLockState(key)` in Angular. Rides the existing event channel, so no
  relay change is required.
