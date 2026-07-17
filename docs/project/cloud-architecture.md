# Roomful Cloud Architecture (EP-23)

Status: `Draft` · Target: v2.8

## Overview

Roomful Cloud adds a **hosted multi-tenant relay** and **management dashboard** on top of the
open-source relay. The open-source relay (`@roomful/relay`) remains self-hostable; Cloud is an
optional commercial layer.

## Architecture Principles

1. **Open-core**: the relay stays MIT-licensed. Cloud adds auth, metering, and dashboard on top.
2. **Vendor-agnostic metering**: usage events are structured, not tied to Stripe/AWS.
3. **Progressive adoption**: start with free tier, upgrade to paid; same relay binary.
4. **Tenant isolation at the edge**: auth happens before any room join.

## System Components

```
┌─────────────────────────────────────────────────────┐
│                   Cloud Dashboard                    │
│  (Web UI — projects, keys, usage, billing, alerts)  │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│                   Cloud API Server                   │
│  • Auth (API keys / JWT)                            │
│  • Project / Room / Quota CRUD                      │
│  • Usage aggregation & query                        │
│  • Webhook dispatch                                 │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  Cloud Relay Gateway                 │
│  • API key validation (edge)                        │
│  • Tenant routing (project → relay instance)        │
│  • Rate limiting (per-project / per-room)           │
│  • Usage event emission                             │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │ Relay 1 │  │ Relay 2 │  │ Relay N │
    │ (shard) │  │ (shard) │  │ (shard) │
    └─────────┘  └─────────┘  └─────────┘
```

### Component Breakdown

| Component               | What it does                                         | Existing?                      |
| ----------------------- | ---------------------------------------------------- | ------------------------------ |
| **Cloud Dashboard**     | Web UI for project/team/usage management             | New — `apps/dashboard`         |
| **Cloud API Server**    | REST API backing the dashboard + programmatic access | New — `packages/cloud-api`     |
| **Cloud Relay Gateway** | Auth + routing + metering edge layer                 | New — extends `@roomful/relay` |
| **Relay Shard**         | Standard `@roomful/relay` instance, unchanged        | ✅ Exists                      |
| **Usage Store**         | Time-series usage events                             | New — PostgreSQL/TimescaleDB   |

## Data Model

### Organization

```
Organization
  id: uuid
  name: string
  slug: string (unique, URL-safe)
  plan: 'free' | 'pro' | 'enterprise'
  created_at: timestamp
```

### Project

```
Project
  id: uuid
  org_id: uuid → Organization
  name: string
  slug: string (unique per org)
  relay_url: string (assigned relay shard)
  quota_rooms: int (max concurrent rooms, default 10)
  quota_peers_per_room: int (default 50)
  quota_messages_per_minute: int (default 1000)
  quota_storage_mb: int (default 100)
  created_at: timestamp
```

### API Key

```
ApiKey
  id: uuid
  project_id: uuid → Project
  name: string (label)
  key_prefix: string (first 8 chars, for display)
  key_hash: string (bcrypt/sha256)
  scopes: jsonb (['rooms:read', 'rooms:write', 'admin'])
  expires_at: timestamp?
  last_used_at: timestamp?
  created_at: timestamp
  revoked_at: timestamp?
```

### Room

```
Room (logical, not the relay-internal room)
  id: uuid
  project_id: uuid → Project
  room_id: string (the actual room identifier)
  status: 'active' | 'idle' | 'closed'
  peer_count: int
  message_count: int
  created_at: timestamp
  last_activity_at: timestamp
```

### Usage Event

```
UsageEvent
  id: uuid
  project_id: uuid → Project
  room_id: string
  event_type: enum (see below)
  quantity: float
  unit: string
  metadata: jsonb
  recorded_at: timestamp
```

### Usage Event Types

| event_type         | unit        | Description                                |
| ------------------ | ----------- | ------------------------------------------ |
| `room.minute`      | minutes     | Wall-clock time a room was active          |
| `peer.connection`  | connections | Unique peer connection                     |
| `message.sent`     | messages    | Relay messages forwarded                   |
| `storage.byte`     | bytes       | Durable storage consumed (comments, state) |
| `recording.minute` | minutes     | Session recording duration                 |
| `ai.action`        | actions     | AI agent action executed                   |

## API Key Authentication

### Key Format

```
roomful_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
│       │    │                                          │
│       │    └─ 48 random chars (base62)
│       └────── environment prefix (live | test)
└────────────── service identifier
```

### Validation Flow (Gateway)

```
1. Client connects with ?api_key=roomful_live_xxx
2. Gateway extracts key, hashes, looks up in cache/DB
3. If valid: resolve project → relay shard → proxy WebSocket
4. If invalid: 401 + close connection
5. On every message: check rate limit (per-project, per-room)
6. Emit usage event for billing
```

### Key Management API

```
POST   /v1/projects/:projectId/keys          Create key
GET    /v1/projects/:projectId/keys          List keys
DELETE /v1/projects/:projectId/keys/:keyId   Revoke key
```

## Quota & Rate Limiting

### Rate Limit Tiers

| Tier       | Rooms  | Peers/Room | Msgs/Min | Storage |
| ---------- | ------ | ---------- | -------- | ------- |
| Free       | 5      | 25         | 500      | 50 MB   |
| Pro        | 50     | 200        | 10,000   | 5 GB    |
| Enterprise | Custom | Custom     | Custom   | Custom  |

### Enforcement

- **Gateway-level**: token bucket per project, per room
- **Relay-level**: existing `--max-rooms`, `--max-room-size` flags
- **Exceeded**: 429 + `X-RateLimit-Reset` header

## Dashboard API Surface

### Auth

```
POST /v1/auth/token        Exchange API key for JWT (dashboard sessions)
```

### Projects

```
GET    /v1/projects              List projects for org
POST   /v1/projects              Create project
GET    /v1/projects/:id          Get project details
PATCH  /v1/projects/:id          Update project
DELETE /v1/projects/:id          Delete project
```

### Rooms

```
GET    /v1/projects/:id/rooms         List active rooms
GET    /v1/projects/:id/rooms/:roomId Room details + metrics
```

### Usage

```
GET /v1/projects/:id/usage?from=X&to=Y&granularity=hour|day|month
```

### API Keys

```
GET    /v1/projects/:id/keys          List keys (prefix + metadata, never full key)
POST   /v1/projects/:id/keys          Create key (returns full key once)
DELETE /v1/projects/:id/keys/:keyId   Revoke key
```

## Implementation Phases

### Phase 1: Data Model + API Keys (this sprint)

- `packages/cloud-api`: data model (SQL migrations), API key CRUD
- Gateway prototype: API key validation at edge

### Phase 2: Metering + Quotas

- Usage event emission in gateway
- Usage aggregation queries
- Quota enforcement

### Phase 3: Dashboard

- `apps/dashboard`: minimal web UI
- Project management, key management, usage charts

### Phase 4: Production Hardening

- Multi-region relay sharding
- Enterprise packaging (#234)

## Open Decisions

| #   | Decision         | Options                                                          |
| --- | ---------------- | ---------------------------------------------------------------- |
| D1  | Database         | PostgreSQL (with TimescaleDB for usage) vs SQLite for simplicity |
| D2  | Relay sharding   | DNS-based routing vs gateway proxy vs consistent hashing         |
| D3  | Gateway runtime  | Node.js (same stack) vs Cloudflare Workers (edge) vs Envoy       |
| D4  | Webhook delivery | Direct HTTP POST vs message queue (Redis Streams)                |
