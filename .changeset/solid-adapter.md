---
'@roomful/solid': minor
---

Add the SolidJS adapter (`@roomful/solid`), the first v1.1 "Ecosystem" deliverable.

It mirrors the React adapter surface in idiomatic Solid: `RoomfulProvider` plus
`useRoom`, `usePresence`, `useCursors`, `useAwareness`, `useEvent`, `usePeers`,
`useConnectionStatus`, and `useSharedState`. State is reactive via Solid signals,
and the same one-binding-per-room shared-state guard as the React and Vue adapters
applies.
