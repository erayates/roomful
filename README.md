# Roomful

<img width="2172" height="724" alt="Roomful" src="https://github.com/user-attachments/assets/9a5d00dd-6320-48db-b082-6c531113f18e" />

[![npm](https://img.shields.io/npm/v/@roomful/core?color=0f766e&label=%40roomful%2Fcore)](https://www.npmjs.com/package/@roomful/core) [![CI](https://github.com/erayates/roomful/actions/workflows/ci.yml/badge.svg)](https://github.com/erayates/roomful/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-0f766e.svg)](LICENSE) [![Status: stable](https://img.shields.io/badge/status-stable-0f766e.svg)](https://github.com/erayates/roomful/releases)

**Add live cursors, presence and shared state to any web app, in any framework.**

**[Docs](https://docs.roomful.dev)** · **[Live demo](https://demo.roomful.dev)** · **[Storybook](https://storybook.roomful.dev)** · **[npm](https://www.npmjs.com/package/@roomful/core)**

Roomful is an open-source TypeScript SDK for multiplayer collaboration. It gives you the building blocks (rooms, presence, cursors, shared state, events) so you don't have to build realtime infrastructure yourself.

## Why Roomful

- **One API, five frameworks.** React, Vue, Svelte, Solid and Angular adapters on top of the same core.
- **Start without a server.** Same-origin tabs sync over BroadcastChannel out of the box. Add the relay when you need cross-machine rooms.
- **Your infrastructure, your data.** The relay is a single Node.js process or Docker image you host yourself, with JWT auth and Redis for scaling out.
- **Conflict-free state.** Last-write-wins for simple cases, CRDT (Yjs) when multiple people edit the same data.

## Quick start

```bash
npm install @roomful/core @roomful/react
```

```tsx
import { RoomfulProvider, usePresence, useCursors, useSharedState } from '@roomful/react';

export function App() {
  return (
    <RoomfulProvider roomId="board-42" presence={{ name: 'Alice', color: '#4F46E5' }}>
      <Board />
    </RoomfulProvider>
  );
}

function Board() {
  const { others } = usePresence();
  const { ref, cursors } = useCursors();
  const [votes, setVotes] = useSharedState('votes', { initialValue: { yes: 0, no: 0 } });

  return (
    <div ref={ref}>
      <p>{others.length} people here</p>
      <button onClick={() => setVotes((v) => ({ ...v, yes: v.yes + 1 }))}>Yes ({votes.yes})</button>
    </div>
  );
}
```

Not using React? The core works on its own:

```ts
import { createRoom } from '@roomful/core';

const room = createRoom('board-42', { transport: 'auto', presence: { name: 'Alice' } });
await room.connect();

room.usePresence().subscribe((peers) => console.log(`${peers.length} peers online`));
```

Open the same page in two tabs to see it work. For rooms across machines, point the room at a relay (see [Self-hosting](#self-hosting)).

## Features

**Core collaboration**
Rooms and peer lifecycle, presence, live cursors, shared state (`lww`, `crdt`, `custom`), awareness (typing, focus, selection) and events.

**Collaboration UI**
Viewport follow mode, distributed locks, laser pointer, anchored comments, undo/redo with a shared timeline, and a prebuilt cursor and presence UI kit.

**Transports and scaling**
`auto`, `broadcast`, `webrtc`, `websocket` (with polling fallback) and opt-in `webtransport` over HTTP/3. Self-hosted relay with JWT auth and Redis coordination for multiple instances.

**Developer experience**
Devtools inspector, typed error codes with remediation docs, session recording and replay, and runnable examples (canvas, editor, dashboard, multiplayer game).

## Packages

| Package             | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `@roomful/core`     | Rooms, transports and collaboration engines     |
| `@roomful/react`    | Provider and hooks                              |
| `@roomful/vue`      | Plugin and composables                          |
| `@roomful/svelte`   | Stores and actions                              |
| `@roomful/solid`    | Provider and signal-based hooks                 |
| `@roomful/angular`  | `provideRoomful` and signal injectables         |
| `@roomful/next`     | Server-side relay auth tokens for Next.js       |
| `@roomful/cursors`  | Prebuilt collaboration UI components            |
| `@roomful/relay`    | Self-hosted relay server (CLI and Docker image) |
| `@roomful/devtools` | Debugging and diagnostics                       |

Dart and Flutter SDKs are available as alpha releases on pub.dev.

## Self-hosting

```bash
npm install -g @roomful/relay
roomful-relay --port 8080
```

Or with Docker:

```bash
docker run --rm -p 8787:8787 -e HOST=0.0.0.0 erayatesdev/roomful:latest
```

Set `ROOMFUL_REDIS_URL` to run several relay instances behind a load balancer. See the [self-hosting guide](docs/getting-started/self-hosting.md) for auth, Docker Compose and production settings.

## Documentation

- [Docs site](https://docs.roomful.dev)
- [Quickstart](docs/getting-started/quickstart.md)
- [Rooms and transports](docs/getting-started/rooms-and-transports.md)
- [Core API reference](docs/reference/core-api.md)
- [Roadmap](ROADMAP.md)

## Contributing

Bug reports, ideas and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), which also covers the release process; local setup and tests are in [LOCAL_DEV_GUIDE.md](LOCAL_DEV_GUIDE.md).

- Issues: <https://github.com/erayates/roomful/issues>
- Discussions: <https://github.com/erayates/roomful/discussions>
- Security reports: see [SECURITY.md](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE).
