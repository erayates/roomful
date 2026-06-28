---
'@roomful/angular': minor
---

Add the Angular adapter (`@roomful/angular`), the second v1.1 "Ecosystem" deliverable.

It mirrors the React adapter surface in idiomatic functional Angular: `provideRoomful`
plus `injectRoom`, `injectPresence`, `injectCursors`, `injectAwareness`, `injectEvent`,
`injectPeers`, `injectConnectionStatus`, and `injectSharedState`. State is exposed as
Angular signals, teardown is wired through `DestroyRef`, and the same one-binding-per-room
shared-state guard as the React and Vue adapters applies.
