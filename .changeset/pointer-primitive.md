---
'@roomful/core': minor
'@roomful/react': minor
'@roomful/vue': minor
'@roomful/svelte': minor
'@roomful/solid': minor
'@roomful/angular': minor
---

Add the Pointer (laser pointer) primitive (`room.usePointer()` plus per-adapter bindings) — a
v1.5 "new primitives" deliverable. Broadcast a transient "beam" at a peer's pointer position
while active and drop it the moment they deactivate: `activate` and `deactivate` gate
broadcasting, `mount(element)` tracks `mousemove` and broadcasts the normalized position, and
`subscribe` plus `getAll` expose remote beams. A `PointerBeam` carries `peerId`, `name`, `color`,
normalized `x`/`y` (0–1 of the container, resolution-independent like cursors and viewport), and
`active`; the name and color are resolved from the peer's presence. A built-in zero-config
`render({ container, style })` overlay draws each remote active beam, where `style` is one of
`laser` (a glowing dot), `spotlight` (a soft radial dim), `crosshair` (thin cross lines), or
`dot` (a plain dot). This release ships the core engine and the React `usePointer()` hook (which
returns `ref`, `beams`, `activate`, `deactivate`, and `render`); the Vue, Svelte, Solid, and
Angular bindings follow in the fan-out. It rides the existing event channel, so no relay change
is required.
