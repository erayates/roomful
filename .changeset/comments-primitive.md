---
'@roomful/core': minor
'@roomful/react': minor
'@roomful/vue': minor
'@roomful/svelte': minor
'@roomful/solid': minor
'@roomful/angular': minor
---

Add the Comments primitive (`room.useComments()` plus per-adapter bindings) — a v1.5 "new
primitives" deliverable. Open collaborative threads anchored to an element, a canvas point, or a
text-selection range: `add({ anchor, text })`, `thread(id).reply/resolve/reopen`, with `getAll`,
`getByElement`, `getOpen`, and `subscribe`. Unlike the ephemeral primitives, comments are
persistent collaborative state — threads ride the room's existing CRDT sync channel on a dedicated
internal key, so they converge across peers and reach late joiners with no relay change and no
collision with a user's `useSharedState`. The `'memory'` storage backend (the synced in-room
structure) is implemented fully; `'indexeddb'` and `'rest'` add best-effort local persistence and a
REST mirror on top of it. This changeset adds the core engine and the React `useComments()` hook;
the remaining adapter bindings land as the primitive fans out across Vue, Svelte, Solid, and
Angular.
