---
'@roomful/core': minor
'@roomful/react': minor
'@roomful/vue': minor
'@roomful/svelte': minor
'@roomful/solid': minor
'@roomful/angular': minor
---

Add the Viewport Sync primitive (`room.useViewport()` plus per-adapter bindings) — the first
v1.5 "new primitives" deliverable. Broadcast a peer's scroll/zoom and follow or present to
others: `broadcast`/`stopBroadcast`, `present`/`stopPresenting`, `follow(peerId)`/`unfollow`,
over a mounted container element with normalized (0–1) coordinates. Exposed as `useViewport()`
in React/Vue/Solid, `viewport` on the Svelte `roomful()` store, and `injectViewport()` in
Angular. It rides the existing event channel, so no relay change is required.
