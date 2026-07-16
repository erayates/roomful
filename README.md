# Roomful

<img width="2172" height="724" alt="image" src="https://github.com/user-attachments/assets/9a5d00dd-6320-48db-b082-6c531113f18e" />

[![npm](https://img.shields.io/npm/v/@roomful/core?color=0f766e&label=%40roomful%2Fcore)](https://www.npmjs.com/package/@roomful/core) [![CI](https://github.com/erayates/roomful/actions/workflows/ci.yml/badge.svg)](https://github.com/erayates/roomful/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-0f766e.svg)](LICENSE) [![Status: stable](https://img.shields.io/badge/status-stable-0f766e.svg)](https://github.com/erayates/roomful/releases)

**[Website](https://roomful.dev)** · **[Docs](https://docs.roomful.dev)** · **[Live demo](https://demo.roomful.dev)** · **[Storybook](https://storybook.roomful.dev)** · **[GitHub](https://github.com/erayates/roomful)** · **[npm](https://www.npmjs.com/package/@roomful/core)**

Roomful is an open-source, framework-agnostic SDK designed to help frontend teams add multiplayer collaboration features without building custom realtime infrastructure from scratch.

## Project Status

> **Stable JS SDK — v2.0.0 core.** Roomful's npm package set is implemented, locally verified across 10 public packages, and publicly verified across npm, GitHub Release, Docker Hub, docs, and demo surfaces.

All major JavaScript/TypeScript features are implemented and tested across 10 public npm packages.

- API contracts are stable and implemented.
- All framework adapters (React, Vue, Svelte, Solid, Angular) provide full presence, cursors, state, awareness, events, and the v1.5 collaboration primitives (viewport sync, locking, pointer, comments, history) APIs.
- `@roomful/next` mints relay-compatible auth tokens server-side for Next.js apps.
- The relay server supports WebSocket, polling, JWT auth, and Redis coordination.
- Release automation validates all public package tarballs and packed-consumer smoke apps before npm publishing. Public release verification checks npm, GitHub Release, Docker Hub, docs, and demo surfaces after publishing.

## Why Roomful

Building collaboration features usually requires you to stitch together transport, peer lifecycle, presence state, conflict resolution, and reconnection behavior. Roomful focuses on delivering these as composable primitives:

- `room` lifecycle and peer registry
- `presence` for who is online and what they are doing
- `cursors` for live pointer positions
- `state` for synchronized shared data
- `awareness` for ephemeral UI context
- `events` for fire-and-forget signals
- v1.5 primitives: `viewport` sync, `locks`, laser `pointer`, `comments`, and `history` (undo/redo + timeline)

## Feature Overview

| Area                | Description                                              | Status    |
| ------------------- | -------------------------------------------------------- | --------- |
| Core room lifecycle | `createRoom`, connect/disconnect, peer events            | Available |
| Presence engine     | peer metadata, subscriptions, updates                    | Available |
| Cursor engine       | pointer sync, rendering helpers                          | Available |
| Shared state engine | `lww`, `crdt`, `custom` merge strategies                 | Available |
| Awareness engine    | transient focus/typing/selection state                   | Available |
| Event engine        | ephemeral room and peer-targeted events                  | Available |
| Viewport sync       | scroll/zoom follow and present mode (v1.5)               | Available |
| Locking engine      | distributed advisory locks (v1.5)                        | Available |
| Pointer engine      | laser-pointer beams + overlay (v1.5)                     | Available |
| Comments engine     | anchored collaborative threads (v1.5)                    | Available |
| History engine      | per-peer undo/redo + shared timeline (v1.5)              | Available |
| React adapter       | provider + hooks API                                     | Available |
| Vue adapter         | plugin + composables                                     | Available |
| Svelte adapter      | stores + actions                                         | Available |
| Solid adapter       | provider + signal-based hooks                            | Available |
| Angular adapter     | `provideRoomful` + signal injectables                    | Available |
| Next.js auth tokens | server-side relay JWTs (`@roomful/next`)                 | Available |
| Relay server        | optional WebSocket relay for scale                       | Available |
| Prebuilt UI kit     | cursors/presence/typing components                       | Available |
| AI peers            | agent identity, action stream, approvals (v1.7)          | Available |
| Session recording   | capture, .roomful export, time-travel replay (v1.6-v1.8) | Available |
| WebTransport        | HTTP/3 transport + edge relay (v1.8)                     | Available |
| Diagnostics         | peer/state/locks/comments inspector (v1.10)              | Available |
| Error catalog       | typed codes + remediation docs (v1.10)                   | Available |
| Network topology    | SVG live peer graph (v1.10)                              | Available |
| Ephemeral rooms     | no persistence, auto-disconnect TTL (v1.11)              | Available |
| Audit log           | hash-chained tamper-evident events (v1.11)               | Available |
| Dart SDK            | `roomful` alpha (source-present, pub.dev pending)        | Alpha     |
| Flutter SDK         | Provider, cursors, avatars, state (pub.dev pending)      | Alpha     |

CRDT note: `strategy: 'crdt'`, `room.getYDoc()`, and `room.getYProvider()` require installing the `yjs` and `y-protocols` peer dependencies.

## Quick Start

```bash
npm install @roomful/core

# Add these only if you use CRDT/Yjs features
npm install yjs y-protocols
```

```ts
import { createRoom } from '@roomful/core';

const room = createRoom('my-first-room', {
  transport: 'auto',
  presence: { name: 'Alice', color: '#4F46E5' },
});

await room.connect();

const presence = room.usePresence();
presence.subscribe((peers) => {
  console.log('Peers in room:', peers.length);
});

window.addEventListener('beforeunload', () => {
  void room.disconnect();
});
```

## Package Matrix

| Package             | Purpose                                 | Status    |
| ------------------- | --------------------------------------- | --------- |
| `@roomful/core`     | room, transports, collaboration engines | Available |
| `@roomful/react`    | React provider/hooks                    | Available |
| `@roomful/vue`      | Vue plugin/composables                  | Available |
| `@roomful/svelte`   | Svelte store/action integration         | Available |
| `@roomful/solid`    | Solid provider/signal hooks             | Available |
| `@roomful/angular`  | Angular `provideRoomful` + injectables  | Available |
| `@roomful/next`     | Next.js server-side relay auth tokens   | Available |
| `@roomful/cursors`  | prebuilt collaboration UI components    | Available |
| `@roomful/relay`    | self-hosted relay server                | Available |
| `@roomful/devtools` | debugging and diagnostics tooling       | Available |

## Documentation

- [Documentation site](https://docs.roomful.dev)
- [Documentation index](docs/README.md)
- [Installation](docs/getting-started/installation.md)
- [Quickstart](docs/getting-started/quickstart.md)
- [Core API reference](docs/reference/core-api.md)
- [Code quality guidelines](docs/project/roomful-code-quality-guidelines.md)
- [Contributing guide](CONTRIBUTING.md)
- [Roadmap](ROADMAP.md)

## Relay CLI and Docker

Install the relay as a global CLI:

```bash
npm install -g @roomful/relay
roomful-relay --port 8080
```

Relay runtime environment variables:

| Variable            | Default     | Description                                                              |
| ------------------- | ----------- | ------------------------------------------------------------------------ |
| `PORT`              | `8787`      | TCP port the relay listens on                                            |
| `HOST`              | `127.0.0.1` | Interface the relay binds to. Docker examples override this to `0.0.0.0` |
| `MAX_CONNECTIONS`   | unset       | Optional concurrent WebSocket connection cap                             |
| `ROOMFUL_REDIS_URL` | unset       | Optional Redis URL used to coordinate multiple relay instances           |

Docker image — `erayatesdev/roomful` (`:latest` tracks the newest release; pin a published release tag when available):

```bash
docker pull erayatesdev/roomful:latest
docker run --rm -p 8787:8787 -e HOST=0.0.0.0 erayatesdev/roomful:latest
```

Compose examples:

```bash
# Local image build
docker compose up --build

# Local build with Redis coordination
ROOMFUL_REDIS_URL=redis://redis:6379/0 docker compose --profile redis up --build

# Production image
docker compose -f docker-compose.prod.yml up -d
```

## Monorepo Setup

Issue `EP-01 #001` scaffolds this repository as a `pnpm` + `turborepo` monorepo with buildable package stubs.

### Prerequisites

- Node.js `20` for local development (pinned via `.nvmrc` and `.node-version`)
- Runtime compatibility baseline for published packages: Node.js `20+`
- `pnpm`

### Install and Validate

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm typecheck:root
pnpm test
pnpm test:watch
```

Release tooling commands:

```bash
pnpm changeset
pnpm version-packages
pnpm release:status
```

`pnpm version-packages` applies version bumps and updates package-level `CHANGELOG.md` files.

Type checking is split intentionally:

- `pnpm typecheck`: runs per-workspace checks through Turbo.
- `pnpm typecheck:root`: runs a root `tsc --noEmit` over `packages/*` (apps are typechecked per-workspace above).

Testing is package-scoped for this sprint:

- `pnpm test`: runs Vitest via Turbo for `packages/*`.
- `pnpm test:watch`: starts package test watch mode.
- Coverage reports are emitted under `packages/<name>/coverage`.

CI/CD baseline for EP-01 `#005`:

- PR validation runs on every PR to `main`.
- Validation runs on Node `20`.
- Pipeline order: install -> lint -> typecheck -> test -> build.
- Release workflow triggers on `v*` tags, publishes `@roomful/*` via Changesets, and publishes the relay image (`erayatesdev/roomful`) to Docker Hub.
- Release workflow creates a GitHub Release after npm and Docker publishing succeed.
- Changesets release PR workflow (`.github/workflows/changesets-release-pr.yml`) runs on pushes to `main`.
- Release workflow requires `NPM_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, and optionally uses `TURBO_TEAM` / `TURBO_TOKEN`.

### Workspace Layout

- `packages/*`: core SDK and adapters (`@roomful/*`)
- `apps/*`: internal applications
- `examples/*`: runnable collaboration examples for canvas, editor, dashboards, and multiplayer flows
- `benchmarks/`: relay load and scaling benchmarks with report generation

## Development Direction

Project execution is tracked across 6 sprints and 9 epics:

- Foundation and repository setup
- Core transport and room lifecycle
- Collaboration engines
- Framework adapters and relay
- Advanced capabilities and DX
- Docs, testing, and launch

Details: [Execution plan](docs/project/execution-plan.md)

## Community and Contribution

- File bugs: <https://github.com/erayates/roomful/issues>
- Start discussions: <https://github.com/erayates/roomful/discussions>
- Contribute: [CONTRIBUTING.md](CONTRIBUTING.md)
- Community conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Security

Please do not disclose vulnerabilities in public issues. Use the process in [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
