# @roomful/cloud-api

> Roomful Cloud API — project management, API keys, usage metering, and dashboard backend.

This package provides the cloud management layer for Roomful. It includes:

- **Project management** — create, list, update, delete projects with quota limits
- **Room management** — create, list, update, delete rooms per project
- **API key management** — generate, list, revoke API keys with scoped permissions
- **Usage metering** — event-based usage tracking (room.minute, peer.connection, message.sent, etc.)
- **Quota enforcement** — per-project limits with tier-based defaults (free/pro/enterprise)

All stores come with in-memory implementations suitable for development and testing.
Production deployments should use the Postgres-backed stores from `@roomful/relay`.

## Installation

```bash
npm install @roomful/cloud-api
```

## Usage

```ts
import { InMemoryProjectStore, InMemoryApiKeyStore, InMemoryUsageStore } from '@roomful/cloud-api';

const projectStore = new InMemoryProjectStore();
const project = await projectStore.createProject('org-1', { name: 'My Project' });
```
