# Hosted Relay Beta — Architecture

Audience: contributors and operators.

The self-hosted `@roomful/relay` is a single-tenant Node.js server (or Cloudflare Worker) that
routes WebSocket and WebRTC signaling traffic for rooms. The **hosted relay** (Roomful Cloud)
extends this into a multi-tenant, metered, API-key-gated service so teams can use Roomful without
running their own infrastructure.

> **Status:** Implementation in progress. Management API (project/room/quota CRUD) is shipped in
> `@roomful/relay` (`packages/relay/src/management/`) with Zod schema validation, REST API handler,
> and InMemoryManagementStore. The management API is now mountable in the relay server via the
> `managementApi` config option. Cloud API (`packages/cloud-api`) provides Organization, Project, Room,
> and ApiKey models with InMemory stores, quota helpers, and usage metering. Tests for all components
> reach >70% coverage. Persistent storage (PostgreSQL), webhook dispatch, and cloud deployment remain
> in design/planning. This document defines the beta scope for issue
> [#231](v2-v3-backlog.md#ep-23-cloud--open-core-commercial-layer).

## 1. Design Goals

| Goal                             | How                                                         |
| -------------------------------- | ----------------------------------------------------------- |
| Multi-tenant isolation           | Projects own rooms; an API key scopes to one project.       |
| Metered usage without lock-in    | Emit standard usage events; billing stays vendor-agnostic.  |
| Drop-in SDK experience           | Same `createRoom` call, different `relayUrl` + `relayAuth`. |
| Operate on existing relay engine | The hosted relay runs the same `@roomful/relay` code.       |
| Low operational cost at beta     | Start with a single region, minimal services.               |

## 2. System Overview

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Roomful SDK  │────▶│  API Gateway      │────▶│  Auth Service        │
│  (Web/Flutter)│     │  (TLS termination,│     │  (API key → project, │
│               │     │   rate limiting)   │     │   JWT issuance)      │
└──────────────┘     └────────┬─────────┘     └──────────┬──────────┘
                              │                          │
                              ▼                          ▼
                     ┌──────────────────┐     ┌─────────────────────┐
                     │  Relay Pool       │     │  Control Plane       │
                     │  (@roomful/relay  │     │  (API keys, billing, │
                     │   + Redis coord,  │     │   dashboard, auth)   │
                     │   + Management)   │     │                      │
                     └────────┬─────────┘     └──────────┬──────────┘
                              │                          │
                              ▼                          ▼
                     ┌──────────────────┐     ┌─────────────────────┐
                     │  Usage Pipeline   │     │  PostgreSQL          │
                     │  (events → queue  │     │  (projects, api_keys,│
                     │   → aggregate)    │     │   usage, audit)      │
                     └──────────────────┘     └─────────────────────┘
```

### 2.1 API Gateway

- Terminates TLS at `wss://relay.roomful.dev` (WebSocket) and `https://api.roomful.dev` (REST).
- Routes WebSocket upgrades to the relay pool; routes REST calls to the control plane.
- Enforces global rate limits (IP-level) before the relay sees traffic.

### 2.2 Auth Service

- Accepts long-lived **API keys** (opaque tokens, e.g. `roomful_live_...`) from the SDK.
- Validates the key against PostgreSQL, resolves the owning project and its quotas.
- Issues a short-lived **HS256 JWT** (signed with `ROOMFUL_AUTH_SECRET`) that the relay verifies
  natively — no custom auth plugin needed in the relay pool.
- The JWT carries claims the relay already understands plus project-scoped metadata:

```json
{
  "sub": "peer-abc123",
  "room": "doc-456",
  "project_id": "proj_01H...",
  "exp": 1719000000,
  "iat": 1718999400
}
```

### 2.3 Relay Pool

- Horizontally scaled `@roomful/relay` instances behind a load balancer.
- Redis coordinates rooms across instances (the existing `redis` coordinator mode via `ROOMFUL_REDIS_URL`).
- Each instance verifies the JWT via its built-in `ROOMFUL_AUTH_SECRET` — no external auth calls
  on the hot path.

### 2.3.1 Built-in Management API

`@roomful/relay` ships a **management REST API** (`createManagementApi`, exported from
`packages/relay/src/management/`) that mounts directly into the relay's HTTP server — no separate
control-plane process is required for project/room/quota management during beta.

Endpoints (default prefix `/api/v1`):

```
GET    /api/v1/projects                          List projects (filtered by owner)
POST   /api/v1/projects                          Create project
GET    /api/v1/projects/:projectId               Get project
PUT    /api/v1/projects/:projectId               Update project
DELETE /api/v1/projects/:projectId               Delete project (cascades rooms + quota)
GET    /api/v1/projects/:projectId/rooms         List rooms in project
POST   /api/v1/projects/:projectId/rooms         Create room
GET    /api/v1/projects/:projectId/rooms/:roomId Get room
DELETE /api/v1/projects/:projectId/rooms/:roomId Delete room
GET    /api/v1/projects/:projectId/quota         Get effective quota (explicit + relay defaults)
PUT    /api/v1/projects/:projectId/quota         Set project quota override
GET    /api/v1/projects/:projectId/usage         Point-in-time usage snapshot
```

**Owner resolution** extracts the owner identity from either a JWT Bearer token or the
`X-Roomful-Owner-Id` header. A custom `authorize` callback can enforce per-action access control.

**Storage** is pluggable via the `ManagementStore` interface. The shipped `InMemoryManagementStore`
works for single-process relays; a Redis or PostgreSQL backend can be swapped in for multi-instance
deployments.

### 2.4 Control Plane (External)

The built-in management API covers project/room/quota CRUD. The **external control plane**
(Next.js or Hono, TBD) adds cross-cutting concerns that live outside the relay process:

| Resource  | Operations                                                  |
| --------- | ----------------------------------------------------------- |
| API keys  | create, revoke, rotate (`roomful_live_*`, `roomful_test_*`) |
| Billing   | plan management, payment integration                        |
| Dashboard | Web UI for projects, keys, usage, alerts                    |
| Webhooks  | usage threshold notifications, key rotation                 |

### 2.5 Usage Pipeline

- Every relay instance emits **usage events** on room join/leave and message relay.
- Events flow through a lightweight queue (Redis streams or SQS) to an aggregator.
- The aggregator writes periodic rollups to PostgreSQL and checks quota thresholds.
- When a project exceeds its quota, the control plane marks it `quota_exceeded` and the auth
  service rejects new connections.

### 2.6 Data Store

PostgreSQL holds the operational state. The relay's built-in management types (`Project`,
`RoomRecord`, `ProjectQuota`) are backed by the `ManagementStore` interface — in-memory for
single-process development, PostgreSQL for multi-tenant deployments.

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  projects     │       │  api_keys     │       │  usage_events │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)       │──1:N──│ id (PK)       │       │ id (PK)       │
│ name          │       │ project_id FK │       │ project_id FK │
│ owner_id      │       │ key_prefix    │       │ event_type    │
│ description   │       │ key_hash      │       │ room_id       │
│ metadata_json │       │ scopes        │       │ payload_json  │
│ created_at    │       │ expires_at    │       │ created_at    │
│ updated_at    │       │ last_used_at  │       └──────────────┘
└──────────────┘       │ created_at    │
                       │ revoked_at    │       ┌──────────────┐
┌──────────────┐       └──────────────┘       │  audit_log    │
│  rooms        │                             ├──────────────┤
├──────────────┤                             │ id (PK)       │
│ id (PK)       │                             │ project_id    │
│ project_id FK │                             │ action        │
│ name          │                             │ actor         │
│ metadata_json │                             │ payload_json  │
│ ephemeral     │                             │ created_at    │
│ ttl_ms        │                             └──────────────┘
│ created_at    │
└──────────────┘
┌──────────────┐
│  quota_usage  │
├──────────────┤
│ project_id FK │
│ metric        │
│ period_start  │
│ current_value │
│ limit_value   │
└──────────────┘
```

The data model in `packages/cloud-api/src/models.ts` provides the canonical TypeScript types
(`Organization`, `Project`, `ApiKey`, `ApiKeyScope`, `UsageEvent`, and quota tier presets).

## 3. Quota Model (Beta)

The relay's management layer defines per-project quotas via `ProjectQuota` (`packages/relay/src/management/types.ts`).
A `-1` value means unlimited; `undefined` falls back to the relay-wide `RelayDefaults`. The function
`resolveEffectiveQuota()` merges project-level overrides with defaults.

The beta ships with a single default tier:

| Metric                | Beta Limit | Unit             | Enforcement Point           |
| --------------------- | ---------- | ---------------- | --------------------------- |
| Peak concurrent conns | 50         | connections      | Relay (join reject)         |
| Distinct rooms        | 20         | rooms            | Relay (create reject)       |
| Messages / minute     | 500        | relayed messages | Relay per-peer token bucket |
| Max peers per room    | 25         | peers            | Relay (join reject)         |
| Max ephemeral TTL     | 86 400 000 | ms (24 hours)    | Relay (create reject)       |
| Max total state       | 50         | MB               | Usage aggregator (soft)     |

**Hard limits** (connections, rooms, peers, TTL) block at the relay. **Soft limits** (state bytes)
trigger a dashboard warning; the project stays active during beta.

The `QUOTA_TIERS` in `packages/cloud-api/src/models.ts` define higher-level plans (free, pro,
enterprise) that map onto these relay quota dimensions.

## 4. SDK Integration

No SDK API surface changes. The existing `relayUrl` + `relayAuth` pattern covers it:

```ts
import { createRoom } from '@roomful/core';

const room = createRoom('doc-456', {
  transport: 'websocket',
  relayUrl: 'wss://relay.roomful.dev',
  relayAuth: {
    type: 'token',
    token: 'roomful_live_01H...', // long-lived API key
  },
});
```

The SDK sends the API key as a `token` in the WebSocket join message. The relay verifies the JWT
(the auth service exchanged the API key for a JWT before the upgrade), so the relay itself never
sees the raw API key.

### 4.1 Connection Flow

```
Client                         API Gateway                    Auth Service              Relay Pool
  │                                │                              │                         │
  │  WS upgrade + ?token=rk_...    │                              │                         │
  │───────────────────────────────▶│                              │                         │
  │                                │  POST /auth/exchange         │                         │
  │                                │  { api_key, room_id, peer }  │                         │
  │                                │─────────────────────────────▶│                         │
  │                                │                              │ ─ validates API key     │
  │                                │                              │ ─ checks project quota  │
  │                                │                              │ ─ signs short JWT        │
  │                                │  { jwt }                     │                         │
  │                                │◀─────────────────────────────│                         │
  │                                │                              │                         │
  │                                │  WS upgrade (101)            │                         │
  │                                │  + X-Relay-JWT header        │                         │
  │                                │──────────────────────────────────────────────────────▶│
  │                                │                              │                         │
  │  join { roomId, peerId, token: jwt }                          │                         │
  │──────────────────────────────────────────────────────────────────────────────────────▶│
  │                                │                              │                         │
  │  joined { peers: [...] }                                      │                         │
  │◀──────────────────────────────────────────────────────────────────────────────────────│
```

## 5. Deployment Architecture (Beta)

A single-region deployment on a container platform (Fly.io, Railway, or Render for beta; Kubernetes
post-beta):

```
                        ┌──────────────┐
                        │  LB / TLS     │
                        └──────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
       │ Relay #1     │ │ Relay #2     │ │ Relay #N     │
       │ (Docker)     │ │ (Docker)     │ │ (Docker)     │
       └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                       ┌───────▼───────┐
                       │ Redis          │
                       │ (coordination)  │
                       └───────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
       │ Auth Svc     │ │ Ctrl Plane  │ │ PostgreSQL   │
       │ (Hono/Next)  │ │ (Hono/Next) │ │              │
       └─────────────┘ └─────────────┘ └─────────────┘
```

- Relay instances: 2–3 containers, auto-scaled on connection count.
- Redis: a single-node instance (or managed, e.g. Upstash) for room coordination and the usage
  event stream. The relay already supports Redis coordination via `ROOMFUL_REDIS_URL`.
- PostgreSQL: managed (e.g. Neon, Supabase) for the control plane.
- Auth service and control plane can share the same process during beta.
- The relay ships as a Docker image (`erayatesdev/roomful`) with Compose files at the repo root
  (`docker-compose.yml`, `docker-compose.prod.yml`).

## 6. Security Model

| Concern              | Approach                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| API key storage      | Hashed (SHA-256) in PostgreSQL; only the prefix is visible.                                                 |
| API key transmission | Sent once at connection; the relay never stores it.                                                         |
| JWT lifetime         | 5 minutes — enough for one WebSocket upgrade.                                                               |
| Relay auth           | The relay verifies the JWT with its existing HS256 mechanism (`verifyJWT` in `packages/relay/src/auth.ts`). |
| Room isolation       | `roomId` + `project_id` in the JWT; relay rejects mismatches.                                               |
| Rate limiting        | IP-level at the gateway; per-project at the auth service.                                                   |
| TLS                  | Terminated at the load balancer; all internal traffic is TLS.                                               |

## 7. Observability

| Signal           | Tool                   | Purpose                                  |
| ---------------- | ---------------------- | ---------------------------------------- |
| Relay health     | `/health` endpoint     | Liveness probe for the load balancer.    |
| Connection count | Relay metric endpoint  | Per-instance gauge for auto-scaling.     |
| Usage events     | Redis streams → DB     | Quota enforcement and dashboard.         |
| Error rate       | Stdout structured logs | Alerting on auth failures, relay errors. |
| Latency (p95)    | Relay emit metric      | Detect relay pool degradation.           |

The relay already logs to stderr; the hosted deployment captures these as structured JSON and
ships them to a log aggregator (e.g. Axiom, Better Stack).

## 8. What's Out of Beta Scope

- Multi-region deployment and global latency routing.
- Custom quota tiers via the external control plane (the relay's `ProjectQuota` API is functional).
- Billing integration (usage events emit, but no payment processor).
- Dashboard UI (the management API exists; a dashboard ships in [#232](v2-v3-backlog.md#ep-23-cloud--open-core-commercial-layer)).
- Enterprise SSO / SAML.
- Audit log export.
- PostgreSQL-backed `ManagementStore` (the `InMemoryManagementStore` works for single-process
  development; a persistent adapter is post-beta).

## 9. Phased Rollout

| Phase | Deliverable                                          | Gate                                    |
| ----- | ---------------------------------------------------- | --------------------------------------- |
| 0     | This architecture doc                                | Reviewed and approved.                  |
| 1     | Control plane: projects, API keys, quotas (API only) | Can create/revoke keys via REST.        |
| 2     | Auth service: API key → JWT exchange                 | SDK connects with `roomful_live_*` key. |
| 3     | Usage pipeline: events → queue → aggregate           | Quota usage visible in DB.              |
| 4     | Deploy relay pool + Redis to a cloud provider        | `wss://relay.roomful.dev` live.         |
| 5     | Internal beta (team only)                            | No critical bugs over 1 week.           |
| 6     | Waitlist beta (5–10 projects)                        | Usage patterns understood; no abuse.    |

### Phase Progress

- **Phase 0** (this document): ✅ Complete.
- **Management API** (built into `@roomful/relay`): ✅ Shipped — `createManagementApi` provides
  project/room/quota CRUD via REST, backed by the pluggable `ManagementStore` interface.
  `InMemoryManagementStore` serves single-process relays; a PostgreSQL adapter is planned.
- **Phase 1** (API key management): The `cloud-api` package (`packages/cloud-api`) ships the data
  model (`Organization`, `Project`, `ApiKey`, `QUOTA_TIERS`) and API key primitives. The REST
  surface for key create/revoke/list is next.
- **Phase 2** (Auth service): API key → JWT exchange not yet implemented.
- **Phase 3** (Usage pipeline): Events → queue → aggregate not yet implemented; the
  `ProjectUsage` snapshot endpoint exists in the management API.
- **Phase 4** (Cloud deployment): Not started.

## 10. Open Questions

1. **API Gateway:** Nginx/Caddy vs. Cloudflare Tunnel vs. platform-native (Fly/Railway proxy)?
   → Decide during Phase 4 based on the chosen cloud provider.
2. **Control plane framework:** Next.js (already in the monorepo) vs. Hono (lighter, edge-native)?
   → Next.js likely wins because the monorepo already has `@roomful/next` and `apps/demo` using it.
   The management CRUD is now handled by the relay's built-in API; the external control plane is
   scoped to API keys, billing, dashboard, and webhooks.
3. **Redis provider:** Self-hosted vs. Upstash?
   → Upstash for beta (zero maintenance); self-hosted option added post-beta.
4. **Usage event schema:** Exact fields and retention policy?
   → Define in Phase 3 alongside the metering module already started in `packages/cloud-api/src/metering.ts`.
5. **API key format:** `roomful_live_*` (as used in the cloud-api models) vs. a shorter prefix?
   → Stick with `roomful_live_*` / `roomful_test_*` to match the existing `cloud-architecture.md` design.
6. **ManagementStore persistence:** Keep `InMemoryManagementStore` for beta or ship a PostgreSQL
   adapter from day one?
   → The `ManagementStore` interface makes this swappable. Ship with in-memory for beta simplicity;
   users who need persistence can implement the interface or wait for the PostgreSQL adapter.

## Related Docs

- [Docs index](../README.md)
- [Cloud Architecture (EP-23)](cloud-architecture.md)
- [v2 → v3 backlog](v2-v3-backlog.md)
- [Post-v3 Operating Roadmap](post-v3-operating-roadmap.md)
- [Innovation & Moat](innovation-moat.md)
- [Self-hosting guide](../getting-started/self-hosting.md)
- [Security model](../reference/security.md)
- [@roomful/relay README](../../packages/relay/README.md)
