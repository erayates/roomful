# Shared Canvas Example

A minimal browser canvas that stores completed strokes in CRDT-backed shared state. Open two tabs
with the same room ID, draw in either tab, and late joiners receive the existing stroke history.

## Run

```bash
pnpm --filter @flockjs/example-shared-canvas dev
```

The example defaults to `broadcast` transport so it works locally without a relay.

## What It Shows

- `createRoom()` with local presence.
- `room.useState(..., { strategy: 'crdt' })` for late-join stroke history.
- Canvas pointer handling with compact stroke payloads.
- Presence list updates for connected collaborators.
