# Shared Canvas Example

A browser whiteboard that stores completed strokes in CRDT-backed shared state and adds a shared
**laser pointer**. Open two tabs with the same room ID, draw in either tab (late joiners receive the
existing stroke history), then switch to **Laser** to point at things — your cursor broadcasts as a
laser beam every peer sees. A starter for collaborative canvas and whiteboard apps.

## Run

```bash
pnpm --filter @roomful/example-shared-canvas dev
```

The example defaults to `broadcast` transport so it works locally without a relay.

## What It Shows

- `createRoom()` with local presence.
- `room.useState(..., { strategy: 'crdt' })` for late-join stroke history.
- Canvas pointer handling with compact stroke payloads.
- A shared **laser pointer** via `room.usePointer()` — `activate()`/`deactivate()` toggles
  broadcasting, and `subscribe()` streams remote peers' beams (drawn on the canvas).
- Presence list updates for connected collaborators.
