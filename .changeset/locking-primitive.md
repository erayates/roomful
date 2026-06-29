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
`acquire(key, { ttl, timeout })`, `release`, `releaseAll`, with `isLocked`, `getHolder`,
`getAll`, `subscribe`, and `subscribeAll`. Locks are ephemeral (auto-release on disconnect, TTL
expiry, or explicit release) and resolve deterministically across peers. Exposed as `useLocks()`
and `useLockState(key)` in React, Vue, and Solid; `locks` and `lockState(key)` on the Svelte
store; and `injectLocks()` and `injectLockState(key)` in Angular. Rides the existing event
channel, so no relay change is required.
