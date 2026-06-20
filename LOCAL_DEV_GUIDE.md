# Local Development Guide

This guide explains how to run, test, and validate Roomful locally.

## Prerequisites

- Node.js `20` recommended
- `pnpm`
- `git`

## Initial Setup

```bash
git clone https://github.com/erayates/roomful.git
cd roomful
pnpm install
```

## Monorepo Notes

- The repository uses `pnpm workspaces`
- Root orchestration uses `turbo`
- `@roomful/core` uses `yjs` and `y-protocols` for CRDT features
- In this repo they are available for local development and tests

## Quick Start

The fastest ways to verify the repo is working are:

1. Run the demo app
2. Run the docs app
3. Run the relay server

## Run the Demo App

The main local frontend app is `apps/demo`.

```bash
pnpm --filter @roomful/app-demo dev
```

Other useful commands:

```bash
pnpm --filter @roomful/app-demo build
pnpm --filter @roomful/app-demo preview
pnpm --filter @roomful/app-demo test
pnpm --filter @roomful/app-demo typecheck
```

Expected dev URL is usually:

```text
http://localhost:5173
```

## Run the Playground

`apps/playground` is not a live browser app right now. It does not have a `dev` script.

It currently behaves like a small workspace package with build, test, and typecheck commands:

```bash
pnpm --filter @roomful/app-playground build
pnpm --filter @roomful/app-playground test
pnpm --filter @roomful/app-playground typecheck
```

If you want an actual browser experience, use `@roomful/app-demo`.

## Run the Docs Site

The docs app is in `apps/docs`.

```bash
pnpm --filter @roomful/app-docs dev
```

Other useful commands:

```bash
pnpm --filter @roomful/app-docs build
pnpm --filter @roomful/app-docs preview
pnpm --filter @roomful/app-docs test
pnpm --filter @roomful/app-docs typecheck
```

Expected dev URL is usually:

```text
http://localhost:4321
```

## Run the Relay Server

The relay server supports signaling and websocket relay workflows.

Build it first:

```bash
pnpm --filter @roomful/relay build
```

Then start it:

```bash
pnpm --filter @roomful/relay start
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

With custom host and port:

```bash
HOST=0.0.0.0 PORT=8787 MAX_CONNECTIONS=1000 pnpm --filter @roomful/relay start
```

With Redis enabled:

```bash
ROOMFUL_REDIS_URL=redis://127.0.0.1:6379/0 pnpm --filter @roomful/relay start
```

PowerShell example:

```powershell
$env:ROOMFUL_REDIS_URL="redis://127.0.0.1:6379/0"
pnpm --filter @roomful/relay start
```

## Root Workspace Commands

Build all packages:

```bash
pnpm build
```

Run package tests:

```bash
pnpm test
```

Lint all workspaces:

```bash
pnpm lint
```

Typecheck all workspaces:

```bash
pnpm typecheck
pnpm typecheck:root
pnpm typecheck:all
```

Formatting:

```bash
pnpm format:check
pnpm format:write
```

Quality gate:

```bash
pnpm quality
```

Publish smoke:

```bash
pnpm build
pnpm verify:package-types
pnpm smoke:publish
```

Clean artifacts:

```bash
pnpm clean
```

## Package-Level Commands

### Core

```bash
pnpm --filter @roomful/core build
pnpm --filter @roomful/core test
pnpm --filter @roomful/core test:watch
pnpm --filter @roomful/core typecheck
```

### React

```bash
pnpm --filter @roomful/react build
pnpm --filter @roomful/react test
pnpm --filter @roomful/react typecheck
```

### Vue

```bash
pnpm --filter @roomful/vue build
pnpm --filter @roomful/vue test
pnpm --filter @roomful/vue typecheck
```

### Svelte

```bash
pnpm --filter @roomful/svelte build
pnpm --filter @roomful/svelte test
pnpm --filter @roomful/svelte typecheck
```

### Cursors

```bash
pnpm --filter @roomful/cursors build
pnpm --filter @roomful/cursors test
pnpm --filter @roomful/cursors typecheck
```

### Relay

```bash
pnpm --filter @roomful/relay build
pnpm --filter @roomful/relay test
pnpm --filter @roomful/relay typecheck
```

### Devtools

```bash
pnpm --filter @roomful/devtools build
pnpm --filter @roomful/devtools test
pnpm --filter @roomful/devtools typecheck
```

## Browser and Integration Testing

Install Playwright browsers first:

```bash
pnpm exec playwright install chromium firefox webkit
```

Then run integration suites:

```bash
pnpm test:integration
pnpm test:integration:react
pnpm test:integration:demo
pnpm test:docs
```

Notes:

- `pnpm test:integration` builds core first
- `pnpm test:integration:react` builds core and react first
- WebKit is used as the Safari-equivalent target
- Some WebRTC scenarios may skip automatically if the runtime does not support them

## Recommended Local Workflows

### Fastest UI feedback

```bash
pnpm --filter @roomful/app-demo dev
```

### Demo plus relay

Terminal 1:

```bash
pnpm --filter @roomful/relay build
pnpm --filter @roomful/relay start
```

Terminal 2:

```bash
pnpm --filter @roomful/app-demo dev
```

Then open multiple browser tabs and test room behavior.

### Docs editing

```bash
pnpm --filter @roomful/app-docs dev
```

### Core package development

```bash
pnpm --filter @roomful/core test:watch
```

In another terminal:

```bash
pnpm --filter @roomful/core typecheck
```

## Full Validation Flow

Before opening a PR, this is the safest sequence:

```bash
pnpm format:check
pnpm lint
pnpm typecheck:all
pnpm test
pnpm build
pnpm test:types
pnpm verify:package-types
```

If you also want browser-level validation:

```bash
pnpm exec playwright install chromium firefox webkit
pnpm test:integration
pnpm test:integration:react
pnpm test:integration:demo
pnpm test:docs
```

## Git Hook Behavior

Husky is enabled.

- `pre-commit`: runs `pnpm lint` and `pnpm typecheck`
- `commit-msg`: validates conventional commit messages

Make sure your branch is lint-clean and typecheck-clean before committing.

## Troubleshooting

### Clean reinstall

```bash
pnpm clean
pnpm install
```

### Re-run type safety only

```bash
pnpm typecheck:all
```

### Re-run lint only

```bash
pnpm lint
```

### Test a single package

```bash
pnpm --filter @roomful/core test
```

### Playwright browser issues

```bash
pnpm exec playwright install chromium firefox webkit
```

### Relay connection issues

- verify `relayUrl` points to a running local relay
- verify `http://127.0.0.1:8787/health` responds
- inspect relay terminal logs for auth, socket, or Redis errors

## Useful Filter Examples

```bash
pnpm --filter @roomful/core test
pnpm --filter @roomful/react test
pnpm --filter @roomful/app-demo dev
pnpm --filter @roomful/app-docs dev
pnpm --filter @roomful/relay start
```

## Recommended Day-to-Day Flow

During development:

```bash
pnpm --filter @roomful/app-demo dev
```

For core validation:

```bash
pnpm --filter @roomful/core test
pnpm --filter @roomful/core typecheck
```

Before opening a PR:

```bash
pnpm lint
pnpm typecheck:all
pnpm test
pnpm build
```

Before publishing packages:

```bash
pnpm verify:package-types
pnpm smoke:publish
```
