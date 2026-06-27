# Roomful

<img width="2172" height="724" alt="image" src="https://github.com/user-attachments/assets/9a5d00dd-6320-48db-b082-6c531113f18e" />

[![npm](https://img.shields.io/npm/v/@roomful/core/beta?color=0f766e&label=%40roomful%2Fcore)](https://www.npmjs.com/package/@roomful/core) [![CI](https://github.com/erayates/roomful/actions/workflows/ci.yml/badge.svg)](https://github.com/erayates/roomful/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-0f766e.svg)](LICENSE) [![Status: public beta](https://img.shields.io/badge/status-public%20beta-f59e0b.svg)](https://github.com/erayates/roomful/releases)

**[Website](https://roomful.dev)** · **[Docs](https://docs.roomful.dev)** · **[Live demo](https://demo.roomful.dev)** · **[Storybook](https://storybook.roomful.dev)** · **[GitHub](https://github.com/erayates/roomful)** · **[npm](https://www.npmjs.com/package/@roomful/core)**

Roomful is an open-source, framework-agnostic SDK designed to help frontend teams add multiplayer collaboration features without building custom realtime infrastructure from scratch.

## Project Status

> **Public beta.** Roomful is feature-complete and tested across 7 public packages, but its APIs are not yet battle-tested in production. Install with the `@beta` tag (`npm install @roomful/core@beta`) and please [open an issue](https://github.com/erayates/roomful/issues) with feedback — it shapes the stable 1.0.

All major features are implemented and tested across 7 public packages.

- API contracts are stable and implemented.
- All framework adapters (React, Vue, Svelte) provide full presence, cursors, state, awareness, and events APIs.
- The relay server supports WebSocket, polling, JWT auth, and Redis coordination.
- Release automation validates packages, consumer smoke apps, relay Docker images, and generated GitHub Releases before promotion.

## Why Roomful

Building collaboration features usually requires you to stitch together transport, peer lifecycle, presence state, conflict resolution, and reconnection behavior. Roomful focuses on delivering these as composable primitives:

- `room` lifecycle and peer registry
- `presence` for who is online and what they are doing
- `cursors` for live pointer positions
- `state` for synchronized shared data
- `awareness` for ephemeral UI context
- `events` for fire-and-forget signals

## Feature Overview

| Area                | Description                                   | Status    |
| ------------------- | --------------------------------------------- | --------- |
| Core room lifecycle | `createRoom`, connect/disconnect, peer events | Available |
| Presence engine     | peer metadata, subscriptions, updates         | Available |
| Cursor engine       | pointer sync, rendering helpers               | Available |
| Shared state engine | `lww`, `crdt`, `custom` merge strategies      | Available |
| Awareness engine    | transient focus/typing/selection state        | Available |
| Event engine        | ephemeral room and peer-targeted events       | Available |
| React adapter       | provider + hooks API                          | Available |
| Vue adapter         | plugin + composables                          | Available |
| Svelte adapter      | stores + actions                              | Available |
| Relay server        | optional WebSocket relay for scale            | Available |
| Prebuilt UI kit     | cursors/presence/typing components            | Available |

CRDT note: `strategy: 'crdt'`, `room.getYDoc()`, and `room.getYProvider()` require installing the `yjs` and `y-protocols` peer dependencies.

## Quick Start

```bash
npm install @roomful/core@beta

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
npm install -g @roomful/relay@beta
roomful-relay --port 8080
```

Relay runtime environment variables:

| Variable            | Default     | Description                                                              |
| ------------------- | ----------- | ------------------------------------------------------------------------ |
| `PORT`              | `8787`      | TCP port the relay listens on                                            |
| `HOST`              | `127.0.0.1` | Interface the relay binds to. Docker examples override this to `0.0.0.0` |
| `MAX_CONNECTIONS`   | unset       | Optional concurrent WebSocket connection cap                             |
| `ROOMFUL_REDIS_URL` | unset       | Optional Redis URL used to coordinate multiple relay instances           |

Docker image (`erayatesdev/roomful` — pinned per release; no `:latest` until the stable `1.0.0`):

```bash
docker pull erayatesdev/roomful:1.0.0-beta.7
docker run --rm -p 8787:8787 -e HOST=0.0.0.0 erayatesdev/roomful:1.0.0-beta.7
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
- Runtime compatibility baseline for published packages: Node.js `18+`
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
- Validation runs on Node `18` and `20`.
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
