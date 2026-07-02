# Post-v3 Operating Roadmap

Audience: maintainers and product planning. Confidential strategy reference.

This document tracks the areas that can remain **missing after the v3 feature scope is complete** —
when the project shifts from "feature development" to **productization, trust, distribution, sales, and
sustainability**. See the [Roadmap](../../ROADMAP.md), [v2 → v3 backlog](v2-v3-backlog.md), and
[Innovation & Moat](innovation-moat.md) for everything that comes before this phase.

## Executive Summary

By v3, Roomful is technically strong: Flutter/Dart + web SDKs, self-hostable relay, presence, cursors,
comments, locks, shared state, field-level collaboration, AI-agent presence, approval flow,
history/replay, and a room inspector.

After that point, the product does **not** primarily need more big features — it needs **production
reliability, enterprise-sale readiness, cloud monetization, documentation, a demo/template ecosystem,
customer validation, and continuous SDK maintenance.**

**Working ratio after v3: ~70% hardening / reliability / support / marketing · ~20% customer-driven
improvement · ~10% strategic innovation.**

| Question                       | Objective answer        | Practical consequence                                                         |
| ------------------------------ | ----------------------- | ----------------------------------------------------------------------------- |
| Need new big features?         | Short term, no.         | Do a 3–6 month feature freeze.                                                |
| Is passive maintenance enough? | No.                     | Need reliability, docs, demos, support, cloud beta, feedback loop.            |
| Is marketing enough alone?     | No.                     | Marketing must be backed by live demos, trust metrics, production references. |
| Biggest post-v3 risk?          | Trust and distribution. | Developer-tool sales need trust, onboarding, and case studies.                |

The central question becomes: **who runs this in production, how much do they trust it, how fast do they
integrate it, can they self-host it, and do they pay for it?**

## Assumed-complete core at v3

Flutter/Dart + web SDK · self-hostable relay + basic production deploy options · presence, live cursors,
viewport, selection, shared state · comments, locks, field-level presence, record locking · AI-agent
presence, action timeline, approval flow · room inspector, history/replay, privacy/redaction base ·
documentation, examples, minimal SDK stability.

## Areas That Can Remain Missing

| Area                          | Why it can be missing                                    | Required outputs                                                                                                             |
| ----------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Enterprise Trust & Compliance | Companies need trust, security, privacy, legal to deploy | SSO/SAML, SCIM, audit-log export, data retention policy, security model, SOC 2 prep, DPA/GDPR docs, vulnerability disclosure |
| Cloud & Monetization Layer    | Turning open-source core into revenue                    | Hosted relay, dashboard, usage analytics, API keys, billing, rate limits, team management, webhooks, SLA tiers               |
| Production Reliability        | Realtime infra must be reliable and measurable           | Reconnect recovery, latency metrics, load tests, chaos tests, backpressure, retry policies, event dedup, observability       |
| Customer Validation           | Proof it creates value in real use                       | First 5 production users, case studies, interview loop, feedback board, integration-friction measurement                     |
| Distribution & GTM            | Getting the tool to the right people                     | Launch plan, Flutter community, Hacker News / Product Hunt, outbound, content engine, template demos                         |
| Docs & Onboarding             | Value must be seen in minutes                            | Quickstarts, SDK recipes, copy-paste components, troubleshooting, migration guides, auth examples                            |
| Ecosystem Integrations        | Fit into existing developer stacks                       | Supabase, Firebase, Auth0, Clerk, Postgres, Redis, Yjs, Tiptap, FlutterFlow, React Flow                                      |
| AI Coding Agent Adoption      | Developers set up SDKs via AI assistants                 | MCP server, Cursor/Claude Code instructions, install commands, generated integration plans                                   |
| Open-source Governance        | Sustainable community and contribution                   | Contribution guide, RFC process, issue templates, roadmap voting, maintainer policy, security policy                         |
| Support & Operations          | Managing paying users' problems                          | Support SLA, incident playbook, status page, logs, escalation path, customer-success loop                                    |

## Enterprise Readiness

### Security Program

- **Security model:** which data lives on the client, relay, storage, and logs?
- **Threat model:** malicious clients, room hijacking, replay attacks, token leakage, event poisoning.
- **JWT validation guide:** issuer, audience, expiry, key rotation, permission claims.
- **Rate limit & abuse protection:** per room / user / IP / token / event-type limits.
- **Vulnerability disclosure policy** and security contact.
- **Dependency scanning, SCA, secret scanning, release signing.**

### Compliance & Procurement Pack

Enterprise purchasing cares more about documentation and trust packs than raw features:

- Data retention policy (ephemeral/durable split, history duration, deletion flow).
- DPA / GDPR baseline docs; PII redaction guide (what never hits history, what gets masked).
- Audit-log export format (JSON/CSV; time range, actor, room, action, result).
- Data-residency strategy (EU, US, self-host, private cloud).
- SOC 2 readiness checklist (a prep pack first, not a certificate).

### Enterprise Feature Backlog

| Feature          | Priority | Value to                     | Note                                           |
| ---------------- | -------- | ---------------------------- | ---------------------------------------------- |
| SSO / SAML       | P1       | Enterprise SaaS teams        | Required for Cloud/Enterprise plan             |
| SCIM             | P2       | Large teams                  | User lifecycle management                      |
| Audit exports    | P1       | Compliance-heavy teams       | Should merge with the AI agent action timeline |
| Admin roles      | P1       | Team accounts                | Owner, admin, developer, viewer                |
| Private cloud    | P2       | Security-sensitive customers | Sellable with self-host support                |
| Data residency   | P2       | EU customers                 | Critical for managed cloud                     |
| Custom retention | P2       | Enterprise                   | Also controls history/replay cost              |

## Cloud & Monetization

### Roomful Cloud Beta

Managed relay, dashboard, and observability for teams that don't want to self-host:

- Hosted relay: low-friction managed endpoint running in minutes.
- Project & room dashboard: active users, event count, latency, errors.
- API keys & environments: dev/staging/prod separation.
- Usage analytics: rooms, MAU, events, storage, replay minutes.
- Billing: free / startup / team / enterprise contact-us.
- Webhooks: comment created, approval requested, lock acquired, agent action completed.
- Logs and replay retention settings.

### Open-Core Packaging

| Package              | Content                                                         | Target user             | Revenue logic           |
| -------------------- | --------------------------------------------------------------- | ----------------------- | ----------------------- |
| Open-source Core     | SDK, basic relay, presence, cursors, shared state, locks        | Developers, indie teams | Adoption & community    |
| Pro Cloud            | Hosted relay, dashboard, logs, team management, usage analytics | Startups, SaaS teams    | Subscription            |
| Enterprise Cloud     | SSO, audit logs, retention, SLA, data residency                 | Scale-up / enterprise   | Higher ACV              |
| Enterprise Self-host | Private deploy, support, onboarding, security review            | Privacy-sensitive orgs  | Annual support contract |

**Revenue-model risks:** open-source only may yield no revenue; cloud too early dilutes team focus;
cloud too late lets users self-host without paying; an unclear enterprise-support model loses
security-sensitive teams after adoption.

## Reliability & Operations

Trust is not a feature in realtime products — it is the foundation.

### Production Hardening Checklist

Reconnect recovery (mobile network switch, tab sleep, flaky Wi-Fi) · event deduplication (idempotent
re-delivery) · backpressure (cursor spam, high-frequency events, room fanout limits) · rate limiting
(per event type, soft/hard) · persistence strategy (ephemeral/durable split) · replay safety (disable or
redact for sensitive rooms) · load tests (10 / 100 / 1,000 concurrent rooms) · chaos tests (relay
restart, Redis unavailable, network drop, token expiry) · metrics (p50/p95/p99 latency, reconnect count,
dropped events, memory) · incident playbook (outage, data loss, latency spike, abuse).

### Status & Support Ops

Status page (cloud relay health, API, dashboard, webhooks) · customer-facing incident updates · internal
runbooks (restart, rollback, mitigation, comms) · support tiers (community, pro, enterprise) · SLA
definition (at least a response-time SLA).

## Developer Experience & Docs

**Goal — the first 10 minutes:** a developer sees presence/cursors between two browsers or a Flutter
simulator within 10 minutes of installing.

- Copy-paste quickstart: React, Flutter, self-host relay.
- Hosted sandbox endpoint (run a demo without a local relay).
- Clear error messages (token invalid, room forbidden, relay disconnected).
- Debug overlay (connected, latency, participant count, dropped events).
- Starter templates (collaborative form, CRM lock, comments overlay, AI agent status).

| Docs category | Content                                                              | Priority |
| ------------- | -------------------------------------------------------------------- | -------- |
| Quickstarts   | Flutter, React, self-host, cloud                                     | P1       |
| Recipes       | Field presence, record lock, comment pins, approval flow             | P1       |
| Architecture  | Protocol, relay, persistence, auth, room model                       | P1       |
| Security      | JWT, permissions, redaction, event privacy                           | P1       |
| Operations    | Docker, Kubernetes, Redis, logs, monitoring                          | P1       |
| Migration     | Supabase, Firebase, Ably, custom WebSocket, Liveblocks-like patterns | P2       |
| AI agents     | Agent presence, action timeline, approval workflow                   | P2       |

## Demo, Template & Distribution

### Mandatory demo set

Flutter collaborative form (field presence, field lock, comments) · Web + Flutter same room
(cross-platform protocol) · CRM record locking (real B2B data-conflict problem) · AI agent in-app
collaboration (agent presence, proposed change, approval) · self-host deployment (Docker Compose relay +
Redis + sample app) · Supabase/Firebase auth examples.

### Distribution engine

Product-language pub.dev/npm descriptions · Flutter community content (Medium, Dev.to, Reddit,
Discord/Slack) · a GitHub README that shows value prop + demo GIF + quickstart + self-host link in one
screen · a use-case-driven launch page (not an API list) · comparison pages (vs Firebase/Supabase custom
realtime, vs Liveblocks for Flutter, vs Ably Spaces) · an outbound list of Flutter B2B SaaS teams and
agencies.

## Ecosystem Integrations

| Integration      | Value                                         | Priority | Note                                                         |
| ---------------- | --------------------------------------------- | -------- | ------------------------------------------------------------ |
| Supabase         | Fast adoption for Auth+Realtime Flutter teams | P1       | Ship auth-claim examples                                     |
| Firebase         | One of Flutter's most common backends         | P1       | Position as collaboration layer, not a Firestore replacement |
| Auth0 / Clerk    | SaaS auth integration                         | P2       | Start with a JWT guide                                       |
| Redis            | Self-host relay scale                         | P1       | Presence fanout and coordination                             |
| Postgres         | Durable comments/history                      | P1       | Needed for cloud and self-host                               |
| Yjs / CRDT       | Advanced collaborative editing                | P2       | Post-MVP plugin                                              |
| Tiptap / Lexical | Web editor collaboration                      | P2       | Credibility in the web market                                |
| FlutterFlow      | Flutter low-code ecosystem                    | P3       | Interesting distribution channel                             |
| React Flow       | Canvas/diagram use case                       | P3       | Pairs well with the AI-agent collaboration demo              |

## AI Coding Agent & MCP

Assume developers increasingly set up SDKs through an AI coding assistant, not only docs:

- **MCP server:** Roomful docs, API reference, and examples served as context.
- **Cursor / Claude Code recipes:** `/add-roomful`, `/add-live-cursors`, `/add-record-locking`.
- Framework-specific integration prompts: Flutter, React, Next.js, Supabase, Firebase.
- Generated integration checklist: SDK install, provider setup, auth token, relay config, production notes.
- **AI-safe docs:** short, correct, versioned, copy-paste-runnable code examples.

This lowers adoption cost significantly — a DX advantage, not just marketing.

## Migration & Compatibility

### Migration guides

Firebase Realtime/Firestore presence → Roomful presence/locks/comments · Supabase Presence/Broadcast →
Roomful room model · Ably Presence/Channels → Roomful protocol + component layer · custom WebSocket →
Roomful relay/protocol · Liveblocks-like API mapping (web migration) · DIY cursor → LiveCursorsOverlay /
Flutter overlay.

### Compatibility matrix

| Platform        | Support  | Test coverage           | Note                                 |
| --------------- | -------- | ----------------------- | ------------------------------------ |
| Flutter iOS     | Official | Integration + reconnect | Mobile network matters               |
| Flutter Android | Official | Integration + reconnect | Background/foreground tests          |
| Flutter Web     | Official | Browser matrix          | DOM-less Flutter overlay matters     |
| React Web       | Official | Browser matrix          | Web SDK credibility                  |
| Node.js         | Official | Server SDK tests        | Needed for agent/system participants |
| React Native    | Future   | Spike                   | Mobile-native expansion              |
| Swift / Kotlin  | Future   | Spike                   | Enterprise/native path               |

## Open-source Governance

`CONTRIBUTING.md` (local setup, tests, packages, release flow) · `SECURITY.md` (disclosure, supported
versions) · `CODE_OF_CONDUCT.md` · RFC process for big changes · versioning policy (breaking change,
deprecation, migration window) · maintainer guide (release owner, review rules, publish rights) ·
roadmap voting (community input, product direction preserved) · good-first-issues.

## Customer Validation

### First 5 production users

1 Flutter B2B SaaS app (field presence + record locks) · 1 internal dashboard (web + comments + live
users) · 1 AI-agent SaaS (agent presence + approval flow) · 1 self-host customer (Docker/Redis/Postgres
deploy validation) · 1 agency/studio (integrating Roomful into client projects).

### Metrics to measure

| Metric                          | Why it matters          | Target                        |
| ------------------------------- | ----------------------- | ----------------------------- |
| Time-to-first-presence          | Onboarding quality      | < 10 minutes                  |
| Time-to-production-demo         | Real integration effort | < 1 day                       |
| SDK error rate                  | Stability               | Low and measurable            |
| Reconnect success rate          | Mobile/web reliability  | > 99% target                  |
| Docs completion                 | Self-serve adoption     | Quickstart completion rate up |
| Support tickets per integration | DX problem signal       | Downward trend                |
| Self-host setup success         | Enterprise readiness    | One-command successful setup  |

## 12-Month Post-v3 Roadmap

A productization/growth cadence rather than new big features:

| Period       | Theme                          | Main outputs                                                | Success signal                             |
| ------------ | ------------------------------ | ----------------------------------------------------------- | ------------------------------------------ |
| Months 1–2   | Feature freeze & stabilization | Bug fix, tests, reconnect, docs cleanup, self-host guide    | Quickstart and self-host flows are smooth  |
| Months 3–4   | Demo & validation              | 3 core demos, 5 design partners, case-study interviews      | First production pilots                    |
| Months 5–6   | Cloud beta                     | Hosted relay, dashboard, API keys, logs, usage              | First paid-beta signal                     |
| Months 7–8   | Enterprise trust pack          | Security docs, audit logs, retention, admin roles           | Can pass a security review                 |
| Months 9–10  | Distribution scale             | Launch, comparison pages, content engine, outbound          | Steady inbound + GitHub/pub.dev/npm growth |
| Months 11–12 | Customer-driven roadmap        | Customer-feedback improvements, support ops, pricing refine | Retention and payment validation           |

## Post-v3 Epic / Issue Backlog

### EP-POST3-01: Production Trust Pack

- [P1] Write Roomful security model and threat model
- [P1] Add JWT auth guide with permission claims
- [P1] Add rate limiting and abuse protection
- [P1] Create data retention and redaction policy
- [P2] Add vulnerability disclosure and supported-versions policy
- [P2] Prepare SOC 2 readiness checklist

### EP-POST3-02: Roomful Cloud Beta

- [P1] Build hosted relay project/environment model
- [P1] Add API-key management and usage metering
- [P1] Build a basic dashboard for rooms, users, latency, and errors
- [P2] Add billing primitives and plan limits
- [P2] Add webhooks for comments, approvals, locks, and agent actions

### EP-POST3-03: Developer Experience & Docs

- [P1] Rewrite quickstarts for Flutter, React, self-host, and cloud
- [P1] Create copy-paste recipes for field presence and record locks
- [P1] Add a troubleshooting guide for common relay/auth/reconnect issues
- [P2] Add migration guides from Firebase, Supabase, Ably, and custom WebSocket
- [P2] Add an AI-agent integration guide and approval-flow examples

### EP-POST3-04: Demo & Distribution

- [P1] Publish Flutter collaborative form demo
- [P1] Publish Web + Flutter same-room demo
- [P1] Publish CRM record-locking demo
- [P1] Publish AI-agent collaboration demo
- [P2] Create comparison pages and launch assets
- [P2] Build an outbound target list for Flutter/B2B SaaS teams

### EP-POST3-05: Ecosystem & AI Coding Agents

- [P1] Add Supabase and Firebase auth examples
- [P2] Add Auth0/Clerk JWT examples
- [P2] Create a Roomful MCP server prototype
- [P2] Add Cursor/Claude Code integration instructions
- [P3] Explore a FlutterFlow integration path
- [P3] Add a Yjs/CRDT adapter spike

## Risk Register

| Risk                                 | Impact   | Signal                                    | Mitigation                                              |
| ------------------------------------ | -------- | ----------------------------------------- | ------------------------------------------------------- |
| Wide feature set but no adoption     | High     | Demos watched, installs low               | Feature freeze + onboarding + customer interviews       |
| Cloud too early dilutes the team     | Med-high | SDK bug backlog grows                     | Limited cloud beta; hosted-relay minimum first          |
| Self-host is hard to set up          | High     | Deploy-focused support requests           | One-command Docker Compose + K8s guide + logs           |
| Enterprise trust barrier not cleared | High     | Stuck in security review                  | Trust pack, audit logs, retention, security docs        |
| Web competitors close the gap        | Medium   | Liveblocks/Velt Flutter or self-host move | Strengthen AI-agent + self-host + Flutter-first message |
| Maintenance load rises               | Medium   | Issue response time grows                 | Governance, test automation, community triage           |

## Final Assessment

After v3, the big feature gaps largely close. What remains is **trust, productization, distribution,
cloud, enterprise readiness, documentation, customer validation, and support operations** — not more
technical features. The correct model is not passive maintenance; it is stabilizing the product, easing
self-serve adoption, winning production users, opening a cloud beta, building the first case studies, and
making small, high-impact, customer-driven improvements.

Roomful must move from "what else can we add?" to **"who uses this, how much do they trust it, how do
they scale it, and do they pay for it?"**

## Related Docs

- [Roadmap](../../ROADMAP.md) · [v2 → v3 backlog](v2-v3-backlog.md) · [Innovation & Moat](innovation-moat.md)
