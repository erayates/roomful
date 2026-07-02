# Execution Plan

Audience: contributors.

This summary aligns implementation planning to 6 sprints and 9 epics. All six sprints and nine epics are **complete** — v1.0 shipped as Roomful 1.0.1 on 2026-06-28 (npm `latest`, Docker `:latest`, GitHub Releases). Two further milestones have since shipped: **Ecosystem (v1.1)** on 2026-06-28 and **New Primitives I (v1.5)** on 2026-06-29, the current released milestone. Remaining forward work is planned as the v2 phases below; see the [Roadmap](https://github.com/erayates/roomful/blob/main/ROADMAP.md) for full detail.

## Sprint Timeline

| Sprint   | Duration    | Goal                                                 | Status      |
| -------- | ----------- | ---------------------------------------------------- | ----------- |
| Sprint 1 | Weeks 1-2   | Foundation, monorepo, CI, initial transport baseline | ✅ Released |
| Sprint 2 | Weeks 3-4   | Core primitives: presence, cursors, basic state      | ✅ Released |
| Sprint 3 | Weeks 5-6   | State/awareness/events hardening + React adapter     | ✅ Released |
| Sprint 4 | Weeks 7-8   | Vue/Svelte adapters + relay server                   | ✅ Released |
| Sprint 5 | Weeks 9-10  | CRDT, encryption, UI kit, devtools beta              | ✅ Released |
| Sprint 6 | Weeks 11-12 | Polish, docs completion, launch readiness            | ✅ Released |

## Epic Map

| Epic  | Title                         | Status      |
| ----- | ----------------------------- | ----------- |
| EP-01 | Foundation & Repository Setup | ✅ Released |
| EP-02 | Core Transport Layer          | ✅ Released |
| EP-03 | Collaboration Engines         | ✅ Released |
| EP-04 | Framework Adapters            | ✅ Released |
| EP-05 | Relay Server                  | ✅ Released |
| EP-06 | UI Component Kit              | ✅ Released |
| EP-07 | Advanced Features             | ✅ Released |
| EP-08 | DevTools & DX                 | ✅ Released |
| EP-09 | Docs, Tests & Launch          | ✅ Released |

## Shipped Since v1.5

Three further milestones shipped after New Primitives I, delivering the original `v2.0-beta` scope early:

| Version | Phase             | Focus                                                                   | Status      |
| ------- | ----------------- | ----------------------------------------------------------------------- | ----------- |
| v1.6    | Session Recording | `room.useRecording()` capture / `.roomful` export / replay              | ✅ Released |
| v1.7    | AI Peer + Replay  | `addAIPeer()` headless peers + `room.applyReplaySignal()` visual replay | ✅ Released |
| v1.8    | Transports        | `transport: 'webtransport'` (HTTP/3) + Cloudflare edge relay            | ✅ Released |

## Next: v2 → v3 Long Transition

The roadmap now **expands** (does not restart) into a cross-platform, self-hostable, AI-native
collaboration layer. v2.x is a **~24-sprint / ~48-week** transition; v3.0 (RoomfulScript + a frozen
protocol) ships only after the protocol, Flutter SDK, trust layer, and AI-agent collaboration are stable.

| Version    | Phase                           | Focus                                                                                 |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| v2.0-beta  | Protocol + Relay Stabilization  | Versioned event envelope, schema, replay model, relay hardening, test vectors         |
| v2.1-alpha | Dart Core SDK                   | `roomful` alpha (room lifecycle, presence, events, shared state, reconnect)           |
| v2.2-beta  | Flutter SDK MVP                 | `roomful_flutter` provider/builders/overlay/controllers — pub.dev beta                |
| v2.3       | Self-host + Mobile Trust        | Docker/Redis, JWT & Firebase/Supabase auth, reconnect hardening, cross-platform demos |
| v2.4       | B2B Collaboration Components    | Durable comments, field presence, record locks, vertical component packs              |
| v2.5       | AI Agent Collaboration          | AI peer identity, agent cursor, action stream, approval flow, recording alpha         |
| v2.6       | Observability + Trust           | Room Inspector, audit log, topology visualizer, production-trust docs                 |
| v2.7       | Offline / Local-first           | Offline queue, reconnect recovery, conflict UI, CRDT bridge strategy                  |
| v2.8       | Cloud / Open-Core Readiness     | Hosted relay beta, dashboard, orgs/projects, quotas, usage events                     |
| v3.0-rc    | RoomfulScript + Stable Protocol | Collaboration-as-code, protocol freeze, migration guide/tooling                       |

The detailed epic map (`EP-10`–`EP-25`), the sprint plan (`S01`–`S24`), the issue backlog
(`#101`–`#254`), and release gates (`G1`–`G8`) live in the [v2 → v3 backlog](v2-v3-backlog.md). Strategy
and the innovation idea pool are in [Innovation & Moat](innovation-moat.md); the productization phase is
in the [Post-v3 Operating Roadmap](post-v3-operating-roadmap.md).

v2 is additive and backward-compatible with the released v1.x line — no breaking changes to any v1.x
public API; a stable protocol contract is frozen only at v3.0.

## Definition of Done (Project-Level)

- Acceptance criteria met
- Tests added and passing
- Strict TypeScript compatibility maintained
- Relevant docs updated
- PR reviewed and approved

## Related Docs

- [Roadmap](../../ROADMAP.md)
- [v2 → v3 backlog](v2-v3-backlog.md)
- [Innovation & Moat](innovation-moat.md)
- [Post-v3 Operating Roadmap](post-v3-operating-roadmap.md)
- [Repository structure](repository-structure.md)
- [Release process](release-process.md)
- [Docs index](../README.md)
