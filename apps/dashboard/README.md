# Roomful Dashboard

> Management dashboard for Roomful Cloud — projects, API keys, rooms, and usage metering.

A React + Vite application providing a UI for the Roomful Cloud management API.

## Features

- **Projects** — view, create, update, and delete projects
- **Rooms** — manage rooms per project
- **API Keys** — generate, list, and revoke API keys
- **Usage** — view usage snapshots per project (rooms, peers, state size)

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

Output in `dist/` — deploy to any static hosting (Vercel, Netlify, Cloudflare Pages).

## Configuration

The dashboard connects to a Roomful relay management API. Configure via:

```ts
import { configureDashboard } from './api/client';

configureDashboard({
  baseUrl: 'http://127.0.0.1:8787/api/v1',
  ownerId: 'your-owner-id',
});
```

Start a local relay with management API:

```bash
roomful relay start --port 8787 --management-api
```
