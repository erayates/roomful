# Innovation & Moat

Audience: maintainers and product planning. This is a **forward-looking strategy reference**, not a
daily execution doc — the executable slice lives in the [v2 → v3 backlog](v2-v3-backlog.md) and the
[Roadmap](../../ROADMAP.md). It captures the long-term vision, the defensibility (moat) model, the
innovation idea pool, and the go-to-market thinking.

## Core Vision

Roomful should be an **open-source, self-hostable, AI-native collaboration layer for Flutter and web
apps.** Humans, teams, and AI agents work in the same application with presence, cursors, comments,
locks, approvals, history, and auditability.

The v3 goal is **not** "an open-source Liveblocks clone." It is a **human + AI collaboration layer for
Flutter and web apps.** Roomful must answer three questions well:

1. Can Flutter and web developers integrate Roomful into a project in a day?
2. Do B2B SaaS teams solve a real business problem with it — record locking, comments, approvals, audit?
3. Is what AI agents do inside the product visible, controllable, and auditable?

## v3 Success Definition

By v3, Roomful should have crossed from a "trialable package" to "trusted collaboration infrastructure":

- Cross-platform collaboration protocol running in the **same room** across Flutter and web.
- A clear API set for presence, cursor, viewport, selection, shared state, comments, locks, approvals, history.
- Self-hostable relay with Docker Compose, Redis/Postgres options, JWT auth, rate limits, metrics, logs.
- Room Inspector / DevTools showing active rooms, participants, events, latency, reconnect, lock state.
- AI-agent presence, action timeline, approval workflow, and human-takeover primitives.
- Flagship demos: Flutter + web same room, CRM record lock, collaborative form, AI-agent collaboration.
- Ready for an open-core path: hosted relay, dashboard, analytics, audit logs, enterprise support.

**"Good enough" thresholds** — minimum → strong:

| Criterion         | Minimum                              | Strong                                                                        |
| ----------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| Flutter support   | 15–30 min basic presence/cursor demo | 1-day production-like form/CRM integration; iOS/Android/Web + pub.dev release |
| Self-host         | Docker relay runs                    | Redis/Postgres, metrics, auth, rate limit, deploy guide ready                 |
| AI collaboration  | Agent presence model                 | Agent action timeline, approval, human takeover, audit history                |
| Trust             | Reconnect + logs exist               | Load test, latency budget, error taxonomy, room inspector                     |
| Market validation | A demo exists                        | 5–10 real developer feedbacks and 2–3 pilots                                  |

## Market Gaps & Strategic Wedges

Flutter is the entry door, but the defensible growth area is wider. These wedges reinforce each other:

| Gap                            | Problem                                                                | Roomful opportunity                                                        |
| ------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Flutter / mobile-native collab | Realtime infra exists, but a ready product-level collab layer is weak  | Flutter-first SDK: live cursors, presence, comments, locks, field presence |
| Self-hostable collaboration    | Teams avoid third-party event storage, data-residency, usage-bill risk | Open-source relay, Docker, Redis/Postgres, audit, private deploy           |
| Offline / local-first          | Realtime breaks on field/education/tablet/weak connectivity            | Offline queue, reconnect recovery, conflict strategy, CRDT bridge          |
| Human + AI-agent collaboration | Agents act in the app, but users can't answer "what is it doing?"      | Agent presence, action timeline, approval flow, human takeover             |
| Workflow collaboration         | Cursors are nice, but business value is lock/comment/approval/audit    | Record lock, field lock, comment anchors, approval primitive               |
| Vertical-ready kits            | Every team re-adapts primitives to their product                       | CRM kit, form kit, canvas kit, support kit, education kit                  |
| Cross-platform protocol        | No single behavior model for web, mobile, and AI agents                | Versioned Roomful Protocol + SDK-independent event model                   |

**Ideal message:** _Roomful is an open-source collaboration layer for Flutter and web apps, with
self-hostable realtime infrastructure for humans and AI agents._

## Moat Architecture

Defensibility comes from the **combination**, not any single feature (cursors/presence/comments are
each easy to copy):

| Moat           | Content                                                                                                                                                      | Why defensible                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Protocol moat  | Versioned event contract: `room.join`, `presence.update`, `cursor.move`, `field.focus`, `lock.acquire`, `comment.create`, `agent.action`, `approval.request` | SDKs change, the core protocol stays; web/Flutter/mobile/agent SDKs converge on one model |
| Transport moat | WebSocket, polling fallback, reconnect recovery, offline queue, rate limiting, heartbeat, backpressure                                                       | Creates production trust; more than a thin realtime wrapper                               |
| State moat     | Ephemeral / durable / AI state separation                                                                                                                    | Transient data never mixes with durable data; scalable data model                         |
| DX moat        | RoomfulProvider, LiveCursorsOverlay, FieldPresence, RecordLock, templates, CLI, docs                                                                         | Raises adoption speed — answers "can I add this today?"                                   |
| Trust moat     | Self-host, JWT, audit logs, metrics, error taxonomy, room inspector, privacy redaction                                                                       | Lowers the B2B/enterprise purchase barrier                                                |
| AI-native moat | Agent presence, action timeline, approval, human takeover, agent audit                                                                                       | Owns the future SaaS UX need early                                                        |
| Ecosystem moat | Flutter, web, Node, Firebase/Supabase, Postgres, Redis, Yjs/CRDT plugins                                                                                     | Once a team adopts the Roomful model, it stays across platforms                           |

### State Separation Model

A discipline that becomes critical as the product grows:

- **Ephemeral state** — cursor, presence, viewport, selection, typing, hover. Fast, cheap, short-lived.
- **Durable state** — comments, locks, shared object state, history, approvals, audit log. Verifiable,
  auditable, storage-policy bound.
- **AI state** — agent step, agent cursor, proposed edit, approval status, confidence, failure reason.
  Modeled separately for explainability and human approval.

## Innovation Backlog (40 ideas)

Each idea is a problem → value → target-version. Priority weighs "first market value" and "long-term
moat" together. This is an idea pool that feeds the epics in the [backlog](v2-v3-backlog.md); it is not
a commitment list.

| #   | Idea                               | Problem it solves                                        | Roomful value                                                                   | Target |
| --- | ---------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| 1   | AI Agent Presence                  | Can't see what the AI agent is doing in-app              | Agent is a room participant: online/reading/editing/suggesting/waiting-approval | v2.5   |
| 2   | Agent Action Timeline              | AI actions vanish; debug/audit is hard                   | Every agent step written to room history                                        | v2.6   |
| 3   | Collaborative Approval Flow        | Direct changes create risk                               | propose / approve / reject / requestRevision / apply primitives                 | v2.6   |
| 4   | Field-Level Presence               | Can't see who is on which form field                     | RoomfulFieldPresence: field-level user/agent state                              | v2.2   |
| 5   | Record Locking + Request Control   | Two people edit the same record → corruption             | lock.acquire, requestControl, forceTakeover, release                            | v2.2   |
| 6   | Collaboration Replay               | Hard to see afterward what happened in a room            | Replay of last 5–15 min of events/cursor/comments                               | v3     |
| 7   | Room Inspector DevTool             | Production debug is hard; room state invisible           | Rooms, users, events, locks, latency, reconnect panel                           | v2.4   |
| 8   | Privacy Guard / Redaction          | Sensitive fields/events sync or hit history              | Field-level mask, no-sync, redact, replay-disable policy                        | v2.4   |
| 9   | Roomful Protocol Spec              | Cross-SDK behavior is undefined                          | Versioned, public protocol document                                             | v2.1   |
| 10  | Human + AI Participant Model       | No bot/agent/human/observer distinction                  | participant.type = human/agent/system/bot/observer                              | v2.5   |
| 11  | Human Takeover                     | Can't stop an AI agent mid-wrong-action                  | User can pause/takeover/cancel the agent's task                                 | v2.7   |
| 12  | Agent Confidence + Reasoning       | Agent suggestion confidence/rationale invisible          | Short rationale, confidence, source state, policy warnings                      | v2.7   |
| 13  | Ghost / Observer Mode              | Support/manager wants to watch without presence pressure | Observer presence, limited visibility, no cursor                                | v2.3   |
| 14  | Async Collaboration Notes          | Non-realtime members miss context                        | Room summary, decisions, unresolved comments                                    | v2.8   |
| 15  | Smart Conflict Assistant           | Conflicting changes resolved by hand                     | Conflict explanation + suggested merge                                          | v3     |
| 16  | Session Summary                    | "What happened this session?" unanswered                 | Auto-generated room/session summary                                             | v2.8   |
| 17  | Cross-Device Continuity            | Context lost moving web → mobile                         | Same user session/device handoff model                                          | v3     |
| 18  | Presence Heatmaps                  | Unknown which screens/areas teams cluster on             | Anonymized activity heatmaps for product teams                                  | v3     |
| 19  | Room Templates                     | Each app rewrites the same room config                   | form/crm/canvas/support/education templates                                     | v2.3   |
| 20  | Permission DSL                     | Collaboration permissions scattered in app code          | Room-level policy: who can view/edit/lock/comment/approve                       | v2.4   |
| 21  | Edge Relay Mode                    | Central relay insufficient for global latency            | Region-aware relay, edge deployment templates                                   | v3     |
| 22  | Bring Your Own Database            | Companies want data ownership                            | Postgres, Redis, Supabase, Firebase storage adapters                            | v2.4   |
| 23  | Audit / Event Export               | Enterprise wants event history in other systems          | JSONL/CSV/export webhook for room events                                        | v2.6   |
| 24  | Latency Budget + Quality Modes     | UX degrades on poor connections                          | Quality modes: full, reduced cursor, presence-only                              | v3     |
| 25  | Offline Queue + Reconnect Recovery | Mobile/field connectivity drops                          | Queued operations, idempotency, resync                                          | v2.9   |
| 26  | CRDT / Yjs Bridge                  | LWW insufficient for true collaborative editing          | Optional CRDT adapter; core stays independent                                   | v3     |
| 27  | Multi-Room Workflows               | A user works across many rooms/objects at once           | Room graph, parent/child room, room switching                                   | v3     |
| 28  | Co-browsing / Support Mode         | Support wants the customer's screen context              | Agent follow, cursor, annotation, guided support                                | v3     |
| 29  | Vertical Kits                      | Primitives too abstract for sales                        | CRM, form, canvas, support, education kits                                      | v2.7   |
| 30  | Plugin Marketplace                 | Ecosystem growth needs third-party extensions            | Adapters, UI kits, storage plugins, auth plugins                                | v3+    |
| 31  | Agent Workflow Simulator           | AI workflows risky to test in production                 | Fake room + fake participants + agent step simulation                           | v3     |
| 32  | Roomful Capture for QA             | Bug reports lack collaboration context                   | Session capture, replay, event bundle                                           | v3     |
| 33  | User Intent Awareness              | Cursor movement doesn't convey intent                    | Intent states: editing, reviewing, asking, approving, blocking                  | v2.6   |
| 34  | Notification Layer                 | Mentions, approvals, unresolved comments get missed      | Roomful notifications + email/webhook adapters                                  | v3     |
| 35  | Comment Anchors with State         | Comments lose context when UI changes                    | Anchors tied to entity, field, viewport, or object path                         | v2.5   |
| 36  | Live Validation Constraints        | Multiple users cause invalid shared state                | Room-level validation before shared-state commit                                | v2.6   |
| 37  | AI Policy Engine                   | Unclear which fields an agent may change                 | Agent permissions, approval-required fields, blocked actions                    | v2.7   |
| 38  | Workspace Graph                    | Rooms are disconnected                                   | Projects, rooms, entities, participants graph                                   | v3     |
| 39  | CLI and Templates                  | Setup friction lowers adoption                           | create-roomful-app, flutter template, docker-compose generator                  | v2.2   |
| 40  | Self-host Trust Pack               | Companies need proof to deploy to production             | Security guide, ops guide, load test, metrics, audit, rate limits               | v2.4   |

### Top 10 by priority

1. **AI Agent Presence** — the core of AI-native positioning.
2. **Field-Level Presence** — immediate value for B2B form/admin use cases.
3. **Record Lock API** — solves data corruption; close to sales.
4. **Collaborative Approval Flow** — makes AI + team changes safe.
5. **Room Inspector DevTool** — production trust and DX.
6. **Privacy Guard** — makes the self-host/privacy positioning real.
7. **Roomful Protocol Spec** — the foundation of the cross-platform moat.
8. **Agent Action Timeline** — critical for AI audit and explainability.
9. **Flutter + Web Same-Room Demo** — the strongest marketing/technical showcase.
10. **Self-host Trust Pack** — lowers the enterprise/pilot purchase barrier.

## Go-to-Market

### Ideal customer profiles (ICPs)

| ICP                         | Pain point                                          | Roomful message                                           | Demo                       |
| --------------------------- | --------------------------------------------------- | --------------------------------------------------------- | -------------------------- |
| Flutter B2B SaaS teams      | Must write realtime collab primitives themselves    | Add presence, cursor, comments, locks to your Flutter app | Flutter collaborative form |
| Internal tool / admin teams | Conflicting edits on the same record                | Safe team editing via record locks, field presence, audit | CRM record lock            |
| AI SaaS products            | Can't see what the AI agent does; no approval/audit | Agent presence, action timeline, approval flow            | AI-agent collaboration     |
| Privacy-sensitive teams     | Won't use managed collaboration SaaS                | Self-hostable collaboration infrastructure                | Docker self-host demo      |
| Agencies / software studios | Want to sell collaboration features fast            | Ready Flutter/web collaboration kits                      | Form/CRM/support kit       |

### Killer demo scenario

1. A user opens a CRM record in a React web dashboard.
2. A second user joins the same room from a Flutter mobile app.
3. Both see the same fields, presence avatars, and record-lock state.
4. An **AI agent** joins as a third participant and proposes a change.
5. The human approves or rejects it.
6. Room Inspector shows the event timeline, latency, and agent actions.

One screen showing: cross-platform protocol, the Flutter difference, self-host infra, a B2B workflow,
and AI-agent collaboration.

### Positioning options

| Level      | Message                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Short      | Open-source collaboration layer for Flutter and web apps.                                                  |
| Commercial | Add Figma-like collaboration and AI-agent visibility to your Flutter and web apps.                         |
| Technical  | Self-hostable realtime protocol for presence, cursors, comments, locks, approvals, history, and AI agents. |
| Future     | Human + AI collaboration infrastructure for modern applications.                                           |

## Success Metrics

| Category   | Metric                                                          | Why it matters                   |
| ---------- | --------------------------------------------------------------- | -------------------------------- |
| Adoption   | pub.dev / npm downloads, GitHub stars, demo signups             | Developer-tool interest          |
| Activation | Time to first room connection, first cursor/presence event      | Shows DX friction                |
| Retention  | Weekly active projects, self-host relay activity                | Shows real usage                 |
| Technical  | p95 latency, reconnect success, dropped events, memory/CPU      | Measures production trust        |
| Trust      | Security issues, auth misconfig, redaction-policy test coverage | Critical for enterprise adoption |
| Business   | Pilot count, hosted-relay waitlist, enterprise inquiries        | Measures monetization potential  |

## Product Decision Rule

A feature enters the roadmap only if it strongly answers **at least 2** of:

1. Does it speed integration for a Flutter/web developer?
2. Does it reduce real business risk in B2B SaaS?
3. Does it strengthen the self-host / privacy / trust advantage?
4. Does it make the human + AI collaboration vision concrete?

**Do not:** position Roomful as "just an open-source Liveblocks clone"; over-invest in abstractions like
RoomfulScript before product-market validation; treat every framework adapter as equal priority (which
dilutes Flutter + the core protocol); ship only primitive APIs while deferring ready components
(FieldPresence, RecordLock, CommentThread, ApprovalCard); grow enterprise/self-host claims without a
trust layer; or ship AI features as an "AI" label without approval, audit, and takeover.

## Post-v3 Innovation Themes

Deferred, long-horizon bets (see [Post-v3 Operating Roadmap](post-v3-operating-roadmap.md) for the
productization plan that comes first):

- Collaboration replay and QA capture; agent workflow simulator + deterministic room tests.
- Edge relay and global latency optimization; CRDT bridge and offline-first editing.
- Plugin marketplace and vertical starter kits.
- Roomful Cloud: hosted relay, dashboard, logs, audit, team management.
- Enterprise: SSO/SAML, SCIM, audit exports, data residency, private cloud.
- AI policy engine: approval-required actions, blocked fields, human override, compliance mode.

## Standard Issue Template

```
Title: [Platform] Implement <Feature>

Problem:   <the user problem, one or two sentences>
Goal:      <what to expose / enable>
Scope:     <bullet list of concrete deliverables>
Acceptance Criteria:
  - <observable, testable outcome>
  - Works on the target platforms (e.g. Flutter Web + mobile)
  - Includes docs and an example
```

## Related Docs

- [Roadmap](../../ROADMAP.md) · [v2 → v3 backlog](v2-v3-backlog.md) · [Post-v3 Operating Roadmap](post-v3-operating-roadmap.md)
