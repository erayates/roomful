# @cahoots/core

Framework-agnostic core for [Cahoots](https://github.com/erayates/cahoots) — real-time collaboration primitives (presence, cursors, shared state, awareness, and events) over WebRTC, BroadcastChannel, or a self-hosted WebSocket relay. Zero backend required for small rooms.

## Install

```bash
npm install @cahoots/core

# Optional: CRDT (Yjs) support
npm install yjs y-protocols
```

## Usage

```ts
import { createRoom } from '@cahoots/core';

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

See the [Cahoots repository](https://github.com/erayates/cahoots) for the full API reference, guides, and examples.

## License

MIT
