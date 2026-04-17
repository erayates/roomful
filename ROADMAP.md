# Roadmap

This roadmap aligns with the current execution model: **6 sprints, 9 epics**.

Status labels used below:

- `Planned`: scoped but not started
- `In Progress`: actively being developed
- `Done`: accepted and merged

## Milestone Timeline

| Sprint                 | Focus            | Target Outcome                                  | Status      |
| ---------------------- | ---------------- | ----------------------------------------------- | ----------- |
| Sprint 1 (Weeks 1-2)   | Foundation       | Monorepo, CI/CD, baseline tooling               | Done        |
| Sprint 2 (Weeks 3-4)   | Primitives Core  | Transport stability + presence/cursors baseline | Done        |
| Sprint 3 (Weeks 5-6)   | State & React    | State/awareness/events + React adapter          | Done        |
| Sprint 4 (Weeks 7-8)   | Adapters & Relay | Vue/Svelte adapters + relay server              | Done        |
| Sprint 5 (Weeks 9-10)  | Advanced + UX    | CRDT, encryption, UI kit, devtools beta         | Done        |
| Sprint 6 (Weeks 11-12) | Polish & Launch  | Docs completion, test hardening, `v1.0` prep    | In Progress |

## Epic Map

| Epic  | Name                    | Scope                                       | Status      |
| ----- | ----------------------- | ------------------------------------------- | ----------- |
| EP-01 | Foundation & Repo Setup | Monorepo, quality gates, release tooling    | Done        |
| EP-02 | Core Transport Layer    | WebRTC, BroadcastChannel, room lifecycle    | Done        |
| EP-03 | Collaboration Engines   | Presence, cursors, state, awareness, events | Done        |
| EP-04 | Framework Adapters      | React, Vue, Svelte integration APIs         | Done        |
| EP-05 | Relay Server            | Self-hosted WebSocket relay + auth/scaling  | Done        |
| EP-06 | UI Component Kit        | Prebuilt collaboration UI components        | Done        |
| EP-07 | Advanced Features       | Yjs CRDT, E2E encryption, offline queue     | Done        |
| EP-08 | DevTools & DX           | Debug tooling and diagnostics               | Done        |
| EP-09 | Docs, Tests & Launch    | Documentation, quality bar, release prep    | In Progress |

## Current Priorities

1. Finalize v1.0 package version bumps and release preparation.
2. Complete documentation, working examples, and recipe guides.
3. Verify ≥80% test coverage for core package.
4. Ship first end-to-end examples for integration confidence.

## Change Management

Roadmap updates are proposed via pull requests and reviewed by maintainers.

## Related Docs

- [Execution plan](docs/project/execution-plan.md)
- [Repository structure](docs/project/repository-structure.md)
- [Release process](docs/project/release-process.md)
