# v2 → v3 Backlog

Audience: contributors and maintainers.

This is the execution backlog for the v2 → v3 transition described in the [Roadmap](../../ROADMAP.md).
It holds the epic map (`EP-10`–`EP-25`), the 24-sprint plan (`S01`–`S24`), the proposed GitHub issue
backlog (`#101`–`#254`), and the release gates (`G1`–`G8`). Issue numbers are proposals — renumber
against live GitHub state. Sprints are two weeks each; use sprint numbers, not dates, so they can slide
with team capacity. Each sprint's goal is a **release gate**, not a feature list.

> The `v2.0-beta "AI & Recording"` scope from the previous roadmap (AI Peer, Session Recording,
> WebTransport, Edge Relay) shipped early in **v1.6–v1.8**. `EP-17`/`EP-18` below therefore build on
> that foundation (agent-driven peers, recording capture/replay, edge relay) rather than starting from
> zero, and `EP-10` focuses on the cross-SDK protocol governance the Flutter expansion needs.
>
> **Naming:** the Dart core package is **`roomful`** (bare name, matching the `supabase`/`sentry`
> convention where the core Dart package is unsuffixed) and the Flutter layer is **`roomful_flutter`**.

## Epic Map

| Epic  | Name                                | Status             | Purpose                                                                                         | Target     |
| ----- | ----------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- | ---------- |
| EP-10 | Protocol Governance & Compatibility | ✅ Public Verified | Versioned event envelope, protocol docs, SDK-independent contracts, migration policy            | v2.0-beta  |
| EP-11 | Dart Core SDK                       | ✅ Source alpha    | Pure Dart client: room lifecycle, presence, events, shared state, reconnect, package publishing | v2.1-alpha |
| EP-12 | Flutter SDK & UI Layer              | ✅ Source alpha    | Provider, builders/controllers, cursor overlay, avatars, locks/comments UI foundations          | v2.2-beta  |
| EP-13 | Relay Hardening & Self-host Trust   | ✅ Released        | Docker, Redis, JWT, rate limits, deployment docs, config templates                              | v2.3       |
| EP-14 | Cross-platform Interop Demos        | ✅ Released        | React + Flutter + relay same-room demos; web/mobile parity tests                                | v2.2–v2.3  |
| EP-15 | Durable Collaboration Primitives    | ✅ Released        | Comments persistence, anchors, locks, activity stream, durable room metadata                    | v2.4       |
| EP-16 | Vertical Component Packs            | ✅ Released        | Admin, form, canvas, CRM/support, education starter components                                  | v2.4       |
| EP-17 | AI Peer & Agent Collaboration       | ✅ Released        | AI peer identity, agent cursor, action stream, approvals, `aiResolver` contract                 | v2.5       |
| EP-18 | Session Recording & Replay          | ✅ Released        | Event capture, replay timeline, `.roomful` export format, privacy controls                      | v2.5–v2.6  |
| EP-19 | Observability & DevTools            | ✅ Released        | Room Inspector, network topology, latency/reconnect metrics, debug overlay                      | v2.6       |
| EP-20 | Security, Privacy & Audit           | ✅ Released        | Audit log, tamper-evident events, ZK/ephemeral room design, retention policies                  | v2.6–v2.8  |
| EP-21 | Offline / Local-first Collaboration | ✅ Released        | Offline queue, reconnect recovery, merge strategies, CRDT bridge review                         | v2.7       |
| EP-22 | CLI, Templates & Plugin System      | ✅ Released        | `roomful` CLI, starter apps, plugin runtime, `create-roomful-app` workflows                     | v2.3–v2.8  |
| EP-23 | Cloud / Open-Core Commercial Layer  | `Planned`          | Hosted relay, dashboard, orgs/projects, usage metrics, quotas, billing events                   | v2.8       |
| EP-24 | RoomfulScript & v3 Stable Protocol  | `Planned`          | YAML/JSON collaboration-as-code, schema validation, migration tooling                           | v3.0-rc    |
| EP-25 | DX, Docs, Community & Adoption      | ✅ Released        | Docs, examples, comparison pages, demo videos, contributor flows, public roadmap                | All v2.x   |

## 24-Sprint Plan (S01–S24 / ~48 weeks)

> **Status key:** ✅ Released — `Planned` — not started.

| Sprint | Version    | Focus                         | Status            | Epics               | Main deliverables                                                           | Exit criteria                                              |
| ------ | ---------- | ----------------------------- | ----------------- | ------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| S01    | v2.0-beta  | Roadmap reset + protocol RFC  | ✅ Released       | EP-10, EP-25        | Roadmap PR, protocol v2 RFC, issue labels, project board                    | Roadmap merged; backlog accepted                           |
| S02    | v2.0-beta  | Protocol envelope + schema    | ✅ Released       | EP-10               | Event envelope, versioning, room/peer identifiers, typed payload schemas    | JS SDK consumes protocol v2 alpha without breaking v1      |
| S03    | v2.0-beta  | Relay compatibility + replay  | ✅ Released       | EP-10, EP-13, EP-18 | Relay message normalization, replay buffer skeleton, protocol test vectors  | Interop tests pass with existing adapters                  |
| S04    | v2.1-alpha | Dart package foundation       | ✅ Source alpha   | EP-11               | `roomful` scaffold, models, transport abstraction, CI                       | Package builds and publishes alpha internally              |
| S05    | v2.1-alpha | Dart room lifecycle           | ✅ Source alpha   | EP-11               | RoomfulClient, connect/disconnect, heartbeat, reconnect, peer registry      | Dart client joins relay room and sees JS peers             |
| S06    | v2.1-alpha | Dart primitives alpha         | ✅ Source alpha   | EP-11               | Presence, events, shared state (LWW), locks, cursors, msgpack codec         | Console demo covers presence/events/state/locks/cursors    |
| S07    | v2.2-beta  | Flutter SDK foundation        | ✅ Source alpha   | EP-12               | `roomful_flutter`, RoomfulProvider, controllers, lifecycle integration      | Flutter app connects to relay and manages user identity    |
| S08    | v2.2-beta  | Flutter presence + cursors    | ✅ Source alpha   | EP-12, EP-14        | PresenceAvatars, LiveCursorsOverlay, pointer smoothing                      | Flutter Web/iOS/Android cursor demo works                  |
| S09    | v2.2-beta  | Flutter shared state + locks  | ✅ Source alpha   | EP-12, EP-14        | SharedStateController, RoomfulSharedStateBuilder, example app               | Cross-platform interop demo with React web client          |
| S10    | v2.3       | Self-host quickstart          | ✅ Released       | EP-13, EP-22        | Docker compose, Redis profile, `.env` templates, relay CLI docs             | Clean-machine quickstart under 15 min                      |
| S11    | v2.3       | Auth + mobile reliability     | ✅ Released       | EP-13, EP-14        | JWT guide, Firebase/Supabase auth examples, mobile reconnect tests          | Network switch and app-background tests pass               |
| S12    | v2.3       | Cross-platform showcase       | ✅ Released       | EP-14, EP-25        | React web + Flutter mobile same-room demo, landing/demo page update         | A 60-second demo clearly shows cross-platform value        |
| S13    | v2.4       | Durable comments              | ✅ Released       | EP-15               | Persistent threads, anchors, resolvable comments, storage adapter interface | Comments survive reconnect and reload                      |
| S14    | v2.4       | Field presence + record locks | ✅ Released       | EP-15, EP-16        | FieldPresence, RecordLock, lock conflict UX, activity stream alpha          | Admin/form demo supports collaborative editing safely      |
| S15    | v2.4       | Vertical starter kits         | ✅ Released       | EP-16, EP-25        | Dashboard, form builder, canvas, support/CRM starters                       | At least 3 vertical demos documented                       |
| S16    | v2.5       | AI peer model                 | ✅ Released       | EP-17               | AI peer identity, permissions, agent presence, agent cursor                 | AI peer is visible and distinguishable from a human peer   |
| S17    | v2.5       | Agent actions + approvals     | ✅ Released       | EP-17, EP-18, EP-20 | Action stream, proposed edits, approve/reject flow, audit hooks             | AI actions are inspectable before durable commit           |
| S18    | v2.5       | Recording alpha               | ✅ Released       | EP-18               | Session capture, time-travel replay UI, `.roomful` export draft             | Replay works for presence/cursor/state/comments subset     |
| S19    | v2.6       | Room Inspector                | ✅ Released       | EP-19               | DevTools panel, event timeline, peer list, state inspector                  | Developers can debug a room without console spelunking     |
| S20    | v2.6       | Audit + topology + trust docs | ✅ Released       | EP-19, EP-20, EP-21 | Audit log, network topology visualizer, security architecture docs          | Production-review docs are credible                        |
| S21    | v2.7       | Offline queue                 | ✅ Released       | EP-21               | Local event queue, reconnect flush, idempotency keys, failure states        | Offline operations flush deterministically after reconnect |
| S22    | v2.7       | Merge + CRDT bridge review    | ✅ Released       | EP-21               | Conflict UI, CRDT adapter strategy, Yjs/`y_crdt` feasibility notes          | Clear stable-vs-experimental offline contract              |
| S23    | v2.8       | Cloud / open-core beta        | `Planned`         | EP-23, EP-20, EP-25 | Hosted relay beta, dashboard, org/project model, quotas, usage events       | Cloud beta usable by invited test users                    |
| S24    | v3.0-rc    | RoomfulScript + migration     | `Planned`         | EP-24, EP-25        | RoomfulScript schema, config compiler, migration guide, v3 RC checklist     | v3 RC freezes the protocol and migration path              |

## Issue Backlog (#101–#254)

### EP-10 Protocol Governance & Compatibility

| Issue | Title                                                                             | Scope                                                                         | Acceptance              |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| #101  | Protocol v2 RFC ([draft](../../rfcs/0001-protocol-v2.md))                         | Event envelope, message versioning, backwards compatibility, migration policy | RFC merged              |
| #102  | Protocol test vectors ([`protocol-fixtures/`](../../protocol-fixtures/README.md)) | Same fixture files for JS, Dart, and relay compatibility tests                | Cross-SDK fixtures pass |
| #103  | Room/peer/session identifier standard                                             | Standardize `roomId`, `peerId`, `sessionId`, `surfaceId`, `coordinateSpace`   | Schema accepted         |
| #104  | Ephemeral vs durable state contract                                               | Clarify presence/cursor/viewport vs comments/locks/history split              | Docs + types updated    |

### EP-11 Dart Core SDK

| Issue | Title                                | Scope                                                                 | Acceptance           |
| ----- | ------------------------------------ | --------------------------------------------------------------------- | -------------------- |
| #111  | `roomful` package scaffold           | pubspec, package structure, CI, lint, tests, examples                 | Package builds       |
| #112  | Dart transport abstraction           | WebSocket transport, future polling/WebRTC placeholders, typed events | Transport tests pass |
| #113  | RoomfulClient lifecycle              | connect, disconnect, reconnect, heartbeat, backoff, peer registry     | Console demo works   |
| #114  | Dart presence/events/shared state    | Presence tracking, events API, LWW shared state, subscriptions        | Interop with JS      |
| #115  | Dart locks/comments client contracts | Initial locks/comments API; storage persistence in a later epic       | API docs ready       |

### EP-12 Flutter SDK & UI Layer

| Issue | Title                              | Scope                                                                 | Acceptance                |
| ----- | ---------------------------------- | --------------------------------------------------------------------- | ------------------------- |
| #121  | `roomful_flutter` package scaffold | Flutter package, platform support matrix, sample app setup            | Builds on Web/iOS/Android |
| #122  | RoomfulProvider + lifecycle        | InheritedWidget/Provider-style room lifecycle and user binding        | Example connected         |
| #123  | PresenceBuilder + PresenceAvatars  | Presence UI builders and default avatar stack                         | Demo screenshot/video     |
| #124  | LiveCursorsOverlay                 | Coordinate-space mapping, smoothing, labels, idle/disconnected states | Cursor demo stable        |
| #125  | SharedStateController + Locks API  | Flutter controllers for state and advisory locks                      | Collaborative form demo   |

### EP-13 Relay Hardening & Self-host Trust

| Issue | Title                               | Scope                                                                    | Acceptance          |
| ----- | ----------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| #131  | Docker self-host quickstart         | docker compose, prod compose, env template, Redis optional profile       | Quickstart verified |
| #132  | JWT auth examples                   | Next.js, Firebase Auth, Supabase Auth, and custom backend token examples | Docs + examples     |
| #133  | Relay rate limits + max rooms/users | Configurable limits and safe error codes                                 | Load test pass      |
| #134  | Mobile reconnect hardening          | App background, flaky network, token expiry, reconnect scenarios         | Test matrix pass    |

### EP-14 Cross-platform Interop Demos

| Issue | Title                          | Scope                                                       | Acceptance        |
| ----- | ------------------------------ | ----------------------------------------------------------- | ----------------- |
| #141  | React + Flutter same-room demo | React web and Flutter mobile sharing presence/cursors/state | Demo deployed     |
| #142  | Flutter Web parity test        | Flutter Web with JS SDK in same browser session             | Parity tests pass |
| #143  | Interop documentation          | Protocol, coordinate space, and auth patterns explained     | Docs published    |

### EP-15 Durable Collaboration Primitives

| Issue | Title                                 | Scope                                                          | Acceptance          |
| ----- | ------------------------------------- | -------------------------------------------------------------- | ------------------- |
| #151  | Persistent comments storage interface | Storage adapter contract for Postgres/SQLite/memory            | Adapters documented |
| #152  | Comment anchors                       | Anchor comments to surface, field, node, record, or coordinate | Demo works          |
| #153  | Record locks + conflict UX            | Lock acquisition, expiry, owner display, conflict recovery     | Form demo works     |
| #154  | Activity stream alpha                 | Durable activity events for comments, locks, and state changes | Timeline available  |

### EP-16 Vertical Component Packs

| Issue | Title                   | Scope                                                    | Acceptance            |
| ----- | ----------------------- | -------------------------------------------------------- | --------------------- |
| #161  | Admin dashboard pack    | LiveUsersBar, RecordLock, FieldPresence, ActivityStream  | Starter kit published |
| #162  | Collaborative form pack | FieldPresence, FieldLock, CommentAnchor, conflict notice | Starter kit published |
| #163  | Canvas/whiteboard pack  | CanvasCursors, ViewportSync, LaserPointer, FollowMode    | Starter kit published |
| #164  | CRM/support pack        | LeadLock, AgentPresence, SessionNotes, CoBrowsePresence  | Demo created          |

### EP-17 AI Peer & Agent Collaboration

| Issue | Title                          | Scope                                                         | Acceptance       |
| ----- | ------------------------------ | ------------------------------------------------------------- | ---------------- |
| #171  | AI peer identity model         | Human peer vs AI peer metadata, role, permissions, disclosure | Types accepted   |
| #172  | Agent cursor + presence states | Agent thinking, typing, editing, waiting-approval states      | Demo visible     |
| #173  | Agent action stream            | Every AI action is structured, replayable, and auditable      | Action log works |
| #174  | Approval workflow              | Proposed edit, approve, reject, rollback, permission hooks    | Approval demo    |
| #175  | `useSessionSummarizer` alpha   | Generate room/session summary from replayable events          | Alpha docs       |

### EP-18 Session Recording & Replay

| Issue | Title                        | Scope                                                      | Acceptance           |
| ----- | ---------------------------- | ---------------------------------------------------------- | -------------------- |
| #181  | Recording event model        | Capture ephemeral and durable events with privacy controls | Model accepted       |
| #182  | `.roomful` export format     | Portable session export schema and compression strategy    | Draft spec           |
| #183  | Replay timeline UI           | Time-travel replay for cursor, presence, state, comments   | Replay demo          |
| #184  | Recording retention controls | Retention policy and redaction hooks                       | Security review pass |

### EP-19 Observability & DevTools

| Issue | Title                       | Scope                                                         | Acceptance      |
| ----- | --------------------------- | ------------------------------------------------------------- | --------------- |
| #191  | Room Inspector              | Inspect peers, state, locks, comments, events, transports     | DevTools beta   |
| #192  | Network topology visualizer | Show relay/peer topology, latency, connection state           | Visualizer demo |
| #193  | Error catalog               | Typed error codes, remediation docs, DX-friendly messages     | Docs published  |
| #194  | Usage metrics events        | Presence sessions, messages, rooms, reconnects, feature usage | Telemetry hooks |

### EP-20 Security, Privacy & Audit

| Issue | Title                       | Scope                                                            | Acceptance      |
| ----- | --------------------------- | ---------------------------------------------------------------- | --------------- |
| #201  | Security architecture guide | Threat model, auth, relay trust, data retention, self-host model | Docs published  |
| #202  | Tamper-evident audit log    | Hash-chained audit event model for durable actions               | Prototype works |
| #203  | Ephemeral rooms             | Rooms with no durable storage and strict TTL                     | Feature flag    |
| #204  | ZK rooms feasibility RFC    | Zero-knowledge room design and explicit limitations              | RFC complete    |

### EP-21 Offline / Local-first Collaboration

| Issue | Title                | Scope                                                                   | Acceptance        |
| ----- | -------------------- | ----------------------------------------------------------------------- | ----------------- |
| #211  | Offline queue        | Queue outgoing actions when offline and flush on reconnect              | E2E test pass     |
| #212  | Idempotency keys     | Prevent duplicate durable events after reconnect/retry                  | Relay + SDK tests |
| #213  | Conflict UI patterns | Default UI for lock conflicts and merge conflicts                       | Flutter/web demos |
| #214  | CRDT bridge decision | Evaluate Yjs and Dart CRDT options; define stable/experimental boundary | Decision doc      |

### EP-22 CLI, Templates & Plugin System

| Issue | Title                | Scope                                                       | Acceptance        |
| ----- | -------------------- | ----------------------------------------------------------- | ----------------- |
| #221  | `roomful` CLI v2     | init, relay, doctor, demo, inspect commands                 | CLI beta          |
| #222  | `create-roomful-app` | Web and Flutter starter templates                           | Templates work    |
| #223  | Plugin runtime alpha | Plugin lifecycle, permissions, sandbox boundaries           | Plugin example    |
| #224  | `roomful doctor`     | Validate config, relay reachability, auth, package versions | CLI command works |

### EP-23 Cloud / Open-Core Commercial Layer

| Issue | Title                          | Scope                                                       | Acceptance          |
| ----- | ------------------------------ | ----------------------------------------------------------- | ------------------- |
| #231  | Hosted relay beta architecture | Multi-tenant hosted relay, projects, rooms, quotas          | Architecture review |
| #232  | Dashboard alpha                | Projects, API keys/tokens, room usage, logs                 | Internal beta       |
| #233  | Billing-ready usage events     | Usage metering events without billing-vendor lock-in        | Events emitted      |
| #234  | Enterprise packaging           | Self-host support bundle, SLA outline, deployment checklist | Sales docs draft    |

### EP-24 RoomfulScript & v3 Stable Protocol

| Issue | Title                        | Scope                                                                         | Acceptance       |
| ----- | ---------------------------- | ----------------------------------------------------------------------------- | ---------------- |
| #241  | RoomfulScript schema RFC     | YAML/JSON room config schema and validation rules                             | RFC merged       |
| #242  | Config compiler              | Compile RoomfulScript to SDK/relay config                                     | Compiler alpha   |
| #243  | v2 → v3 migration guide      | Migration commands, breaking-change policy, examples                          | Guide ready      |
| #244  | Protocol v3 freeze checklist | No RC until Flutter, web, relay, and cloud contracts pass compatibility tests | RC gate accepted |

### EP-25 DX, Docs, Community & Adoption

| Issue | Title                                 | Scope                                                                      | Acceptance       |
| ----- | ------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| #251  | Docs information architecture refresh | Separate Web, Flutter, Self-host, AI, Enterprise tracks                    | Pages reviewed   |
| #252  | Comparison pages                      | Liveblocks/Velt/Ably/Supabase comparison with fair positioning             | Pages reviewed   |
| #253  | Demo video pack                       | Flutter collaboration, cross-platform room, AI agent, self-host quickstart | Videos published |
| #254  | Contributor guide for adapters        | How to build new SDK adapters against protocol fixtures                    | Guide published  |

## Release Gates (G1–G8)

| Gate | Name                     | Applies to | Required checks                                                                                         |
| ---- | ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| G1   | Backward compatibility   | All v2.x   | Existing v1/v1.5 public APIs remain stable; new APIs additive; compatibility fixtures pass              |
| G2   | Cross-platform interop   | v2.1+      | JS, Dart, and relay clients share the same protocol fixtures and at least one same-room demo            |
| G3   | Flutter platform support | v2.2+      | Flutter Web, iOS, and Android examples build; platform limitations documented                           |
| G4   | Self-host credibility    | v2.3+      | Docker quickstart, Redis coordination, JWT example, security guide, and a basic load test are available |
| G5   | AI safety / trust        | v2.5+      | AI peer features explicit opt-in; actions are visible, auditable, and approval-aware                    |
| G6   | Observability            | v2.6+      | Room Inspector, structured errors, connection metrics, and audit events are available                   |
| G7   | Offline contract clarity | v2.7+      | Stable vs experimental offline behavior explicitly separated; no unclear data-loss promises             |
| G8   | v3 readiness             | v3.0-rc    | RoomfulScript schema, protocol freeze, migration guide, and cross-SDK compatibility all pass            |

> **v3.0 does not ship just because RoomfulScript is implemented.** It ships only when the protocol,
> Flutter, web, relay, self-host, and migration quality are stable enough to support long-term contracts.

## Risk Register

| Risk                               | Impact                                    | Mitigation                                                                                    |
| ---------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Flutter SDK scope grows too large  | v2.2 slips; public demo delayed           | Keep v2.2 to Provider, presence, cursors, shared state, locks. Comments UI can mature in v2.4 |
| AI features become a gimmick       | Market message weakens                    | Make AI peer auditable, approval-aware, protocol-level; avoid generic chatbot demos           |
| Web competitors out-polish Roomful | Web-only adoption stays low               | Use Flutter/mobile/self-host as the wedge instead of fighting only on React                   |
| Self-host becomes a support burden | Maintainer time consumed                  | Opinionated Docker recipes, `doctor` CLI, error catalog, clear support tiers                  |
| Offline-first overpromising        | Trust damage if data loss occurs          | Mark CRDT/offline experimental until a deterministic test matrix passes                       |
| v3 rushed                          | Breaking changes / unstable RoomfulScript | Keep v2.x long; ship v3 only after protocol freeze and migration tooling                      |

## Related Docs

- [Roadmap](../../ROADMAP.md)
- [Innovation & Moat](innovation-moat.md)
- [Post-v3 Operating Roadmap](post-v3-operating-roadmap.md)
- [Labeling and triage](labeling-and-triage.md) · [Execution plan](execution-plan.md)
