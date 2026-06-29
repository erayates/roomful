# Roadmap

v1.0 is **shipped**: Roomful **1.0.1** is published to npm (`latest`), Docker (`:latest`), and GitHub Releases (2026-06-28). The original execution model — **6 sprints, 9 epics** — is now complete. Two further milestones have since shipped: **Ecosystem (v1.1)** on 2026-06-28 and **New Primitives I (v1.5)** on 2026-06-29 — **v1.5 is the current released milestone**. Remaining forward work is tracked as the **v2 roadmap** below.

Status labels used below:

- `Planned`: scoped but not started
- `In Progress`: actively being developed
- `Released`: shipped to npm / Docker / GitHub Releases

## v1.0 Delivery (Released)

Shipped as Roomful 1.0.1 on 2026-06-28. All six sprints and nine epics are accepted and merged.

### Milestone Timeline

| Sprint                 | Focus            | Target Outcome                                  | Status      |
| ---------------------- | ---------------- | ----------------------------------------------- | ----------- |
| Sprint 1 (Weeks 1-2)   | Foundation       | Monorepo, CI/CD, baseline tooling               | ✅ Released |
| Sprint 2 (Weeks 3-4)   | Primitives Core  | Transport stability + presence/cursors baseline | ✅ Released |
| Sprint 3 (Weeks 5-6)   | State & React    | State/awareness/events + React adapter          | ✅ Released |
| Sprint 4 (Weeks 7-8)   | Adapters & Relay | Vue/Svelte adapters + relay server              | ✅ Released |
| Sprint 5 (Weeks 9-10)  | Advanced + UX    | CRDT, encryption, UI kit, devtools beta         | ✅ Released |
| Sprint 6 (Weeks 11-12) | Polish & Launch  | Docs completion, test hardening, `v1.0` launch  | ✅ Released |

### Epic Map

| Epic  | Name                    | Scope                                       | Status      |
| ----- | ----------------------- | ------------------------------------------- | ----------- |
| EP-01 | Foundation & Repo Setup | Monorepo, quality gates, release tooling    | ✅ Released |
| EP-02 | Core Transport Layer    | WebRTC, BroadcastChannel, room lifecycle    | ✅ Released |
| EP-03 | Collaboration Engines   | Presence, cursors, state, awareness, events | ✅ Released |
| EP-04 | Framework Adapters      | React, Vue, Svelte integration APIs         | ✅ Released |
| EP-05 | Relay Server            | Self-hosted WebSocket relay + auth/scaling  | ✅ Released |
| EP-06 | UI Component Kit        | Prebuilt collaboration UI components        | ✅ Released |
| EP-07 | Advanced Features       | Yjs CRDT, E2E encryption, offline queue     | ✅ Released |
| EP-08 | DevTools & DX           | Debug tooling and diagnostics               | ✅ Released |
| EP-09 | Docs, Tests & Launch    | Documentation, quality bar, release         | ✅ Released |

## v2 Roadmap

v2 takes Roomful from a collaboration SDK to collaboration infrastructure. The five v1.0 principles carry forward unchanged: zero-backend by default, progressive complexity (the simplest case stays ~5 lines), a framework-agnostic core, MIT licensed forever, and primitive-first design.

### Release Milestones

The **Ecosystem (v1.1)** milestone shipped on 2026-06-28: `@roomful/solid`, `@roomful/angular`, and `@roomful/next` (server-issued relay auth tokens) are published to npm.

The **New Primitives I (v1.5)** milestone shipped on 2026-06-29: `useViewport()` (follow-me / presenter), `useLocks()` (advisory distributed mutex), `usePointer()` (laser beams), `useComments()` (persistent threads), and `useHistory()` (per-peer conflict-free undo) are live across the core and all five adapters — all riding the existing transport with no relay changes.

| Milestone          | Version   | Key Deliverables                                                   | Status      |
| ------------------ | --------- | ------------------------------------------------------------------ | ----------- |
| Stable Foundation  | v1.0      | All v1.0 primitives, React/Vue/Svelte adapters, relay server       | ✅ Released |
| Ecosystem          | v1.1      | SolidJS adapter, Angular adapter, Next.js auth tokens              | ✅ Released |
| New Primitives I   | v1.5      | Viewport Sync, Locking, History/Undo, Pointer, Comments            | ✅ Released |
| AI & Recording     | v2.0-beta | AI Peer, Session Recording, WebTransport, Edge Relay               | Planned     |
| Platform           | v2.0      | React Native adapter, CLI tool, Plugin System, ZK Rooms, Ephemeral | Planned     |
| Observability      | v2.1      | Built-in Analytics, Audit Log, Network Topology Visualizer         | Planned     |
| Declarative Config | v3.0      | RoomfulScript — Collaboration-as-Code                              | Planned     |

### Feature Categories

Each v2 feature was weighed on three axes before inclusion: **Impact** (does it unblock a category of apps that cannot be built today?), **Viral potential** (can it be shown in a 30-second screen recording?), and **Composability** (does it strengthen the existing primitives rather than replace them?).

| #   | Category                     | Highlights                                                                                                                         | Target Release |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | New Collaboration Primitives | `useViewport()` follow-me, `useLocks()` distributed mutex, `useHistory()` undo tree, `useComments()` threads, `usePointer()` laser | v1.5 → v2.0    |
| 2   | Transport Revolution         | WebTransport (QUIC/HTTP3), Shared Worker cross-tab transport, Edge Relay (Cloudflare/Deno)                                         | v2.0           |
| 3   | AI Collaboration             | `addAIPeer()` LLM peers, smart conflict resolution (`aiResolver`), `useSessionSummarizer()`                                        | v2.0           |
| 4   | Session Recording & Replay   | Full session capture, time-travel replay, `.roomful` export format                                                                 | v2.0           |
| 5   | Advanced Security            | Zero-Knowledge Rooms, Ephemeral Rooms, tamper-evident Audit Log                                                                    | v2.0 / v2.1    |
| 6   | Platform Expansion           | React Native adapter, `roomful` CLI, Plugin System                                                                                 | v2.0 / v2.1    |
| 7   | Observability                | Built-in presence analytics, network topology visualizer                                                                           | v2.1           |
| 8   | RoomfulScript                | Declarative collaboration-as-code (YAML/JSON config)                                                                               | v3.0           |

### Backward Compatibility

v2 is fully backward-compatible with v1.0 — it is additive only, with no breaking changes:

- No breaking changes to any v1.0 public API.
- New primitives are reached via new `room.use*()` methods and do not interfere with existing ones.
- New transports are opt-in; existing transport config is unchanged.
- The plugin system is additive; existing rooms work without any plugins.
- AI features require explicit opt-in via `addAIPeer()` or `aiResolver` — never implicit.

## Change Management

Roadmap updates are proposed via pull requests and reviewed by maintainers.

## Related Docs

- [Execution plan](docs/project/execution-plan.md)
- [Repository structure](docs/project/repository-structure.md)
- [Release process](docs/project/release-process.md)
