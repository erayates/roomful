# Cloud Management API

Roomful's cloud management layer lets you manage projects, rooms, quota, and API keys through a REST API. It runs alongside the relay server when started with `--management-api`.

## Quick Start

Start a relay with the management API enabled:

```bash
roomful relay start --port 8787 --management-api
```

The management API is served at `http://127.0.0.1:8787/api/v1`.

## Authentication

All endpoints require a Bearer token or an `x-roomful-owner-id` header. See the [Authentication](/reference/auth-providers) guide for details.

## Endpoints

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects` | List all projects visible to the owner |
| `POST` | `/projects` | Create a new project |
| `GET` | `/projects/:projectId` | Get a project by ID |
| `PUT` | `/projects/:projectId` | Update a project |
| `DELETE` | `/projects/:projectId` | Delete a project and its rooms |

### Rooms

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects/:projectId/rooms` | List rooms in a project |
| `POST` | `/projects/:projectId/rooms` | Create a room |
| `GET` | `/projects/:projectId/rooms/:roomId` | Get a room by ID |
| `DELETE` | `/projects/:projectId/rooms/:roomId` | Delete a room |

### Quota

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects/:projectId/quota` | Get project quota |
| `PUT` | `/projects/:projectId/quota` | Set project quota |

### Usage

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects/:projectId/usage` | Get current usage snapshot |
| `GET` | `/projects/:projectId/usage/events` | Query usage event history |
| `POST` | `/projects/:projectId/usage/events` | Record a usage event |

## Usage Events

The relay tracks usage through typed events:

| Event Type | Unit | Description |
|-----------|------|-------------|
| `room.minute` | minutes | Active room time |
| `peer.connection` | connections | Peer connections |
| `message.sent` | messages | Messages sent through the relay |
| `storage.byte` | bytes | State storage used |
| `recording.minute` | minutes | Recording duration |
| `ai.action` | actions | AI agent actions |

## Storage Backends

The management API supports pluggable storage:

- **InMemory** — default, suitable for development and testing
- **PostgreSQL** — production-ready with `PostgresManagementStore` and `PostgresUsageEventStore`

```ts
import { PostgresManagementStore } from '@roomful/relay';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.ROOMFUL_DATABASE_URL });
const store = new PostgresManagementStore({ pool, defaults });

const relay = createRelayServer({
  port: 8787,
  managementApi: { prefix: '/api/v1', store, defaults },
});
```

## Dashboard

A React dashboard is available at `apps/dashboard/` for managing projects, rooms, API keys, and viewing usage metrics.

## Enterprise Deployment

See the [Self-Host Deployment Checklist](/deployment/self-host-checklist) for production deployment guidance including Docker Compose, PostgreSQL, and Redis setup.
