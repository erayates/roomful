# @roomful/core

Framework-agnostic core for [Roomful](https://github.com/erayates/roomful) — real-time collaboration primitives (presence, cursors, shared state, awareness, and events) over WebRTC, BroadcastChannel, or a self-hosted WebSocket relay. Zero backend required for small rooms.

> **Stable — v1.0.** The API is stable and ready for production.

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

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference, guides, and examples.

## License

MIT
