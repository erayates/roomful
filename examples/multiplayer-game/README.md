# Multiplayer Game Example

A tiny shared-position game board. Each connected peer controls one marker, and the board state is
stored in Cahoots shared state so late joiners see every active player.

## Run

```bash
pnpm --filter @cahoots/example-multiplayer-game dev
```

Use the same room ID in two tabs, connect, and move each marker with the arrow buttons or keyboard.

## What It Shows

- Room presence for player identity.
- CRDT-backed state for a shared game board.
- Direct local controls that publish state changes to peers.
- Cleanup of the local player when disconnecting or leaving the page.
