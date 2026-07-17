# Roadmap

Roomful's JavaScript SDK is public-verified at **`@roomful/core` v2.0.0**, building on the released
v1.0, v1.1, v1.5, v1.6, v1.7, and v1.8 capability milestones. The Dart/Flutter packages are
source-present alpha packages, with pub.dev publishing still pending. The next phase does **not
restart** the roadmap — it **expands** the released web base into a cross-platform, self-hostable
collaboration layer for **web, Flutter/mobile, and AI-assisted applications**.

> **Positioning:** Roomful is an open-source collaboration SDK for **Flutter and web apps**, with
> **self-hostable** realtime infrastructure for presence, live cursors, comments, locks, shared
> state, session replay, and **AI agents** — where humans, teams, and AI agents collaborate in the
> same room with presence, approvals, history, and auditability.

The category goal for v3 is **not** "an open-source Liveblocks clone" — it is a **human + AI
collaboration layer for Flutter and web apps.**

Status labels: `Released` (source and package milestone shipped) · `Public Verified` (npm / Docker /
GitHub Release checks pass) · `Source alpha` (implemented in repo, not yet public-package complete) ·
`In Progress` · `Planned` · `Needs RFC`.

## Strategic Direction

Four decisions frame the entire v2 → v3 arc:

1. **Do not restart the roadmap.** Keep the current v1/v1.5 base; expand v2 instead of replacing it.
2. **Flutter/Dart-first wedge.** Flutter is the market-entry wedge (web SDKs are preserved, but the
   product message is no longer React/Vue/Svelte only). `roomful` + `roomful_flutter` become an
   official product line.
3. **Self-host + trust as the core argument.** The open-source, self-hostable relay is a primary
   product value, not a side feature — Docker, Redis, JWT, observability, audit log, deploy recipes.
4. **AI collaboration is a protocol-level primitive**, not a demo — AI peer identity, agent cursor,
   action stream, and approval workflow. v2 is deliberately a long ~24-sprint bridge: v3.0
   (RoomfulScript plus a frozen cross-platform protocol) ships only after the protocol, Flutter SDK,
   trust layer, and AI-agent collaboration are stable enough for long-term contracts.

## Updated Product Principles

The five v1.0 principles carry forward (zero-backend by default, progressive complexity, a
framework-agnostic core, MIT-licensed forever, primitive-first). v2 adds six:

| #   | Principle                                 | What it means                                                                                                                                     |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Primitive-first, **product-ready**        | Core stays primitive-first, but ship ready-made UI and vertical starters, not only low-level API.                                                 |
| P2  | Self-hostable by default, hosted optional | Open-source relay + Docker is the core value; hosted cloud is a later, additive monetization layer.                                               |
| P3  | Cross-platform protocol                   | The protocol is not TypeScript-bound; Dart, React Native, Node, and future native SDKs share one message model. Protocol versioning starts early. |
| P4  | Flutter-first wedge                       | Flutter is the entry door; web is preserved. `roomful`/`roomful_flutter` are the headline v2.1/v2.2 milestones.                                   |
| P5  | Human + AI collaboration                  | An AI peer looks like a user but carries a separate identity, permissions, and an auditable action model. AI is explicit opt-in.                  |
| P6  | Trust before scale claims                 | No "production-ready enterprise" claim before latency, reconnect, auth, retention, audit, load tests, and docs exist (≈ v2.6).                    |

## Released

| Milestone         | Version | Key deliverables                                                                               | Status             |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------- | ------------------ |
| Stable Foundation | v1.0    | All v1.0 primitives, React/Vue/Svelte adapters, relay server (6 sprints / 9 epics EP-01–EP-09) | ✅ Released        |
| Ecosystem         | v1.1    | SolidJS adapter, Angular adapter, Next.js relay-auth tokens                                    | ✅ Released        |
| New Primitives I  | v1.5    | Viewport Sync, Locking, Pointer, Comments, History — across core + all five adapters           | ✅ Released        |
| Session Recording | v1.6    | `room.useRecording()` capture / `.roomful` export / replay across core + all adapters + demo   | ✅ Released        |
| AI Peer + Replay  | v1.7    | `addAIPeer()` headless agent-driven peers + `room.applyReplaySignal()` visual replay           | ✅ Released        |
| Transports        | v1.8    | `transport: 'webtransport'` (HTTP/3) + Cloudflare Workers/Durable Objects **edge relay**       | ✅ Released        |
| Protocol v2 Era   | v2.0.0  | RFC-0001 accepted, protocol fixtures, ephemeral rooms, audit log, idempotency, trust docs      | ✅ Public Verified |

> **Note on the earlier plan.** The previous roadmap's `v2.0-beta "AI & Recording"` scope (AI Peer,
> Session Recording, WebTransport, Edge Relay) **already shipped early** in v1.6–v1.8. The v2.x
> milestones below therefore **redefine** `v2.0-beta` around protocol governance and cross-SDK
> contracts — the groundwork the Flutter/mobile expansion and long-term protocol freeze depend on.

## v2.x — Long Transition Roadmap

v2.x is planned as a **~24-sprint / ~48-week** transition. Big v3 ideas are designed early but only
locked as a stable contract at v3.0. Milestones are release **gates**, not feature checklists.

| Version    | Theme                           | Target output                                                                                                                     | Status             |
| ---------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| v2.0-beta  | Protocol + Relay Stabilization  | Versioned event envelope, message schema, replay model, relay hardening, protocol test vectors                                    | ✅ Public Verified |
| v2.1-alpha | Dart Core SDK                   | `roomful` source alpha: room lifecycle, WebSocket relay, presence, events, shared state, reconnect — pub.dev pending              | Published alpha    |
| v2.2-beta  | Flutter SDK MVP                 | `roomful_flutter`: Provider, PresenceBuilder, PresenceAvatars, LiveCursorsOverlay, SharedStateController, Locks — pub.dev pending | Published alpha    |
| v2.3       | Self-host + Mobile Trust        | Docker Compose, Redis coordination, JWT/Firebase/Supabase auth examples, mobile reconnect hardening, cross-platform demos         | ✅ Released        |
| v2.4       | B2B Collaboration Components    | Comments persistence, field presence, record locks, activity stream, dashboard/form/canvas starter kits                           | ✅ Released        |
| v2.5       | AI Agent Collaboration          | AI peer identity, agent cursor, action stream, approval flow, session summarizer alpha, comment anchors                           | ✅ Released        |
| v2.6       | Observability + Trust           | Room Inspector, network topology, audit log, retention policy, usage metrics, error catalog, intent states                        | ✅ Released        |
| v2.7       | Offline / Local-first           | Offline queue, deterministic merge, CRDT adapter review, reconnect recovery, conflict UI, AI policy engine                        | ✅ Released        |
| v2.8       | Cloud / Open-Core Readiness     | Hosted relay beta, dashboard, teams/projects, quotas, billing-ready usage events, async notes/summary                             | Planned            |
| v3.0-rc    | RoomfulScript + Stable Protocol | Declarative collaboration-as-code, protocol v3 freeze, migration guide/tooling                                                    | Needs RFC          |

### v3.0

v3.0 focuses on **RoomfulScript** (declarative collaboration-as-code) and a **frozen cross-platform
protocol**. It ships only when web, Flutter, relay, self-host, observability, and migration contracts
are stable — **not** merely when RoomfulScript is implemented.

## Epic Map

`EP-01`–`EP-09` are preserved as the v1 delivery scope (all Released). The v2 → v3 work is tracked as
new epics starting at `EP-10`, so history stays intact on GitHub Issues/Projects.

| Epic  | Name                                | Purpose                                                                                         | Target                                                                      |
| ----- | ----------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| EP-10 | Protocol Governance & Compatibility | Versioned event envelope, protocol docs, SDK-independent contracts, migration policy            | v2.0-beta                                                                   |
| EP-11 | Dart Core SDK                       | Pure Dart client: room lifecycle, presence, events, shared state, reconnect, package publishing | v2.1-alpha                                                                  |
| EP-12 | Flutter SDK & UI Layer              | Provider, builders/controllers, cursor overlay, avatars, locks/comments UI foundations          | v2.2-beta                                                                   |
| EP-13 | Relay Hardening & Self-host Trust   | Docker, Redis, JWT, rate limits, deployment docs, config templates                              | v2.3                                                                        |
| EP-14 | Cross-platform Interop Demos        | React + Flutter + relay same-room demos; web/mobile parity tests                                | v2.2–v2.3                                                                   |
| EP-15 | Durable Collaboration Primitives    | Comments persistence, anchors, locks, activity stream, durable room metadata                    | v2.4                                                                        |
| EP-16 | Vertical Component Packs            | Admin, form, canvas, CRM/support, education starter components                                  | v2.4                                                                        |
| EP-17 | AI Peer & Agent Collaboration       | AI peer identity, agent cursor, action stream, approvals, `aiResolver` contract                 | v2.5                                                                        |
| EP-18 | Session Recording & Replay          | Event capture, replay timeline, `.roomful` export format, privacy controls                      | v2.5–v2.6                                                                   |
| EP-19 | Observability & DevTools            | Room Inspector, network topology, latency/reconnect metrics, debug overlay                      | v2.6                                                                        |
| EP-20 | Security, Privacy & Audit           | Audit log, tamper-evident events, ZK/ephemeral room design, retention policies                  | v2.6–v2.8                                                                   |
| EP-21 | Offline / Local-first Collaboration | Offline queue, reconnect recovery, merge strategies, CRDT bridge review                         | v2.7                                                                        |
| EP-22 | CLI, Templates & Plugin System      | `Alpha`                                                                                         | `roomful` CLI, starter apps, plugin runtime, `create-roomful-app` workflows | v2.3–v2.8 |
| EP-23 | Cloud / Open-Core Commercial Layer  | Hosted relay, dashboard, orgs/projects, usage metrics, quotas, billing events                   | v2.8                                                                        |
| EP-24 | RoomfulScript & v3 Stable Protocol  | YAML/JSON collaboration-as-code, schema validation, migration tooling                           | v3.0-rc                                                                     |
| EP-25 | DX, Docs, Community & Adoption      | Docs, examples, comparison pages, demo videos, contributor flows, public roadmap                | All v2.x                                                                    |

The full **issue backlog (#101–#254)**, the **24-sprint plan (S01–S24)**, and the **release gates
(G1–G8)** live in the [v2 → v3 backlog](docs/project/v2-v3-backlog.md).

## Innovation & Moat

Roomful's defensibility comes from the combination of a **cross-platform protocol**, transport
reliability, an **ephemeral / durable / AI state** model, DX, a **trust layer** (self-host, audit,
inspector), an **AI-native** model, and ecosystem integrations — not from any single feature. The
long-term vision, the 40-idea innovation backlog, the ICPs, and the flagship cross-platform + AI-agent
demo are captured in [Innovation & Moat](docs/project/innovation-moat.md).

## Post-v3 Operating Phase

After v3, the work shifts from features to **productization**: enterprise trust/compliance, cloud &
open-core monetization, production reliability, DX/docs, demos & distribution, ecosystem + AI-coding-
agent (MCP) adoption, migration guides, open-source governance, and customer validation — at a roughly
**70% hardening/marketing/support · 20% customer-driven · 10% strategic innovation** split. See the
[Post-v3 Operating Roadmap](docs/project/post-v3-operating-roadmap.md).

## Backward Compatibility

v2 is **additive** and backward-compatible with the released v1.x line:

- No breaking changes to any released v1.x public API; new APIs are additive.
- New SDKs (Dart/Flutter) and new transports are opt-in; existing transport config is unchanged.
- JS, Dart, and relay clients share the same protocol fixtures — at least one same-room demo must pass.
- AI features are explicit opt-in via `addAIPeer()` / `aiResolver`, never implicit, and are auditable.
- Offline/CRDT behavior is marked **experimental** until a deterministic test matrix passes — no
  unclear data-loss promises.
- A stable protocol contract is frozen only at **v3.0**; v2.x may evolve the protocol behind version
  negotiation with migration notes.

## GitHub Project & Labels

Issues are organized with a label + milestone system (type / platform / area / status / priority /
risk) and one milestone per version (`v2.0-beta` … `v3.0-rc`, `v3.0`). See
[Labeling and Triage](docs/project/labeling-and-triage.md).

## Change Management

Roadmap updates are proposed via pull requests and reviewed by maintainers. Large or protocol-affecting
changes go through an [RFC](rfcs/README.md) (`status:needs-rfc`) before implementation — starting with
[RFC-0001: Protocol v2](rfcs/0001-protocol-v2.md) (EP-10 / #101).

## Related Docs & Market References

- [v2 → v3 backlog](docs/project/v2-v3-backlog.md) — epics, 24-sprint plan, issue backlog, release gates
- [Innovation & Moat](docs/project/innovation-moat.md) — vision, moat architecture, 40-idea backlog, GTM
- [Post-v3 Operating Roadmap](docs/project/post-v3-operating-roadmap.md) — productization & operations
- [Execution plan](docs/project/execution-plan.md) · [Labeling and triage](docs/project/labeling-and-triage.md)
- Market references: Liveblocks, Velt, Ably Spaces, Ably Flutter, Supabase Realtime Presence (Flutter), `y_crdt` (Dart CRDT)
