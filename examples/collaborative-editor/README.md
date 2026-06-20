# Collaborative Editor Example

A minimal text editor that uses FlockJS room lifecycle, Yjs document sync, and awareness state.
Open the same room in two tabs and type in either editor.

## Run

```bash
pnpm --filter @flockjs/example-collaborative-editor dev
```

The example uses `broadcast` transport by default so it runs locally without a relay.

## What It Shows

- `room.getYDoc()` and `room.getYProvider()` as singletons for editor integrations.
- Shared `Y.Text` content for concurrent document editing.
- `room.useAwareness()` for typing and focus signals.
- Presence list updates for connected collaborators.
