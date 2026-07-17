# SDD Plan — EP-23 Cloud / Open-Core

> Branch: `feat/ep23-cloud-core`
> Base: `feat/cli-ep22-alpha`
> Status: In Progress

## Overview

Complete the Cloud / Open-Core commercial layer (v2.8 target). RoomfulScript (EP-24) is excluded.

## Parallel Work Packages

Each package runs in its own git worktree with a dedicated subagent.

---

### WP-1: Lint & Housekeeping

| Aspect | Detail |
|--------|--------|
| **Worktree** | `.worktrees/wp1-lint` |
| **Goal** | Fix all 40+ lint errors in relay and cloud-api packages |
| **Files** | `relay/src/management/api.ts`, `store.ts`, `types.test.ts`, `index.ts` |
| **Exit criteria** | `pnpm --filter @roomful/relay lint` passes, `pnpm --filter @roomful/cloud-api lint` passes |

---

### WP-2: Management API Tests

| Aspect | Detail |
|--------|--------|
| **Worktree** | `.worktrees/wp2-api-tests` |
| **Goal** | Achieve >90% coverage on `relay/src/management/api.ts` (currently ~5%) |
| **Files** | `relay/src/management/api.test.ts` (new) |
| **What to test** | All REST endpoints: list/create/get/update/delete projects, rooms, quota CRUD, usage fetch, JWT auth header parsing, CORS preflight, route matching, validation errors, duplicate project/room errors, project-not-found errors, authorization callback, edge cases (empty body, malformed JSON, unknown routes) |
| **Exit criteria** | `pnpm --filter @roomful/relay test` passes; api.ts coverage >90% |

---

### WP-3: Persistent Store — PostgreSQL

| Aspect | Detail |
|--------|--------|
| **Worktree** | `.worktrees/wp3-pg-store` |
| **Goal** | Implement `PostgresManagementStore` implementing `ManagementStore` interface |
| **Files** | `relay/src/management/pg-store.ts`, `relay/src/management/pg-store.test.ts` (new) |
| **What** | PostgreSQL implementation of `ManagementStore` using a connection pool. Schema migration SQL for projects, rooms, quotas tables. Inline tests using testcontainers or a lightweight pg test helper. |
| **Exit criteria** | Implemented, typechecks, tests pass (can mark as integration/skip in CI) |

---

### WP-4: Relay Integration — Mount Management API

| Aspect | Detail |
|--------|--------|
| **Worktree** | `.worktrees/wp4-relay-integration` |
| **Goal** | Mount `createManagementApi` into the relay HTTP server |
| **Files** | `relay/src/server.ts`, `relay/src/management/index.ts` |
| **What** | Add `managementApiPrefix` config option to relay. Mount the management API handler on the relay's HTTP server. Ensure OPTIONS preflight and auth flow work alongside existing relay WebSocket upgrade logic. Update `relay/src/index.ts` exports. |
| **Exit criteria** | Relay starts with management API enabled; GET /api/v1/projects returns 200 with owner filtering |

---

### WP-5: Cloud API — ProjectStore Integration

| Aspect | Detail |
|--------|--------|
| **Worktree** | `.worktrees/wp5-cloud-integration` |
| **Goal** | Wire InMemoryProjectStore into the cloud-api package fully, add missing exports |
| **Files** | `cloud-api/src/index.ts`, `cloud-api/src/api-keys.ts`, `cloud-api/src/metering.ts` |
| **What** | Ensure all cloud-api exports are consistent. Add `UpdateRoomInput` to the Room model if missing. Ensure `ProjectStore` interface methods align with what `InMemoryProjectStore` implements. |
| **Exit criteria** | `pnpm --filter @roomful/cloud-api test` passes; `pnpm --filter @roomful/cloud-api typecheck` passes |

---

### WP-6: Docs Update

| Aspect | Detail |
|--------|--------|
| **Worktree** | `.worktrees/wp6-docs` |
| **Goal** | Update hosted-relay-beta-architecture.md with implementation status |
| **Files** | `docs/project/hosted-relay-beta-architecture.md`, `ROADMAP.md` |
| **What** | Update architecture doc to reflect current implementation state. Update ROADMAP.md EP-23 status from `Planned` to `In Progress` / `Released` as appropriate. Add API reference docs for management endpoints. |
| **Exit criteria** | Architecture doc accurately reflects implementation; ROADMAP updated |

---

## Execution Order

```
WP-1 (lint) ───────┐
                   ├──> sequential (must pass for merge)
WP-2 (api tests) ──┘
                   
WP-3 (pg-store) ───┐  (parallel with WP-4, WP-5, WP-6)
WP-4 (integration) ─┤
WP-5 (cloud-api) ───┤
WP-6 (docs) ────────┘

All merge → PR → rebase onto feat/ep23-cloud-core
```

## Merge Strategy

1. Each worktree's branch: `wp-N/feat/ep23-cloud-core`
2. After all pass: merge into `feat/ep23-cloud-core` sequentially
3. Run full test suite on merged result
4. Push and open PR against `feat/cli-ep22-alpha`
