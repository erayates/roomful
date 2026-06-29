# @roomful/core

Framework-agnostic core for [Roomful](https://github.com/erayates/roomful) — real-time collaboration primitives (presence, cursors, shared state, awareness, events, viewport sync, laser pointer, locks, comments, and history) over WebRTC, BroadcastChannel, or a self-hosted WebSocket relay. Zero backend required for small rooms.

> **Stable — v1.5.** Realtime presence, cursors, and shared state, plus the collaboration primitives (`room.useViewport`, `useLocks`, `usePointer`, `useComments`, `useHistory`). The API is stable and ready for production.

## Install

```bash
npm install @roomful/core

# Optional: CRDT (Yjs) support
npm install yjs y-protocols
```

## Usage

```ts
import { createRoom } from '@roomful/core';

const room = createRoom('my-room', {
  presence: { name: 'Alice', color: '#4F46E5' },
});

await room.connect();

const presence = room.usePresence();
presence.subscribe((peers) => {
  console.log(`${peers.length} peers online`);
});
```

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference, guides, and examples — including the v1.5 collaboration primitives: [viewport](https://github.com/erayates/roomful/blob/main/docs/reference/engines-viewport.md), [locks](https://github.com/erayates/roomful/blob/main/docs/reference/engines-locks.md), [pointer](https://github.com/erayates/roomful/blob/main/docs/reference/engines-pointer.md), [comments](https://github.com/erayates/roomful/blob/main/docs/reference/engines-comments.md), and [history](https://github.com/erayates/roomful/blob/main/docs/reference/engines-history.md).

## License

MIT
