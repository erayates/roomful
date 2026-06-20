# Launch Kit

Audience: maintainers executing the public Cahoots launch.

This kit covers the human launch tasks from EP-09 #057 after the automated release workflow has published npm packages, the relay Docker image, and the GitHub Release.

## Launch Gate

Do not publish announcements until all release gates are verified:

- [ ] CI is green on the release commit.
- [ ] Release tag has been pushed from the intended commit.
- [ ] GitHub Actions release workflow succeeded.
- [ ] Every public `@cahoots/*` package is visible on npm.
- [ ] `docker pull cahoots/relay:<version>` works.
- [ ] GitHub Release exists for the tag and includes generated notes.
- [ ] Documentation site loads at `https://docs.cahoots.dev`.
- [ ] Demo app loads at `https://demo.cahoots.dev`.
- [ ] Storybook loads at the public Storybook URL.

Run the automated public release verifier first:

```bash
pnpm release:verify-public -- --tag v<release>
```

The verifier checks the npm registry, GitHub Release API, Docker Hub relay tag, docs URL, and demo URL. Keep the command output with the release handoff.

## Downloads Baseline

Record the npm weekly downloads baseline immediately after publishing:

```bash
pnpm release:downloads-baseline
```

The command writes JSON and Markdown reports under `docs/project/release-artifacts/`. If packages were just published and npm download data has not propagated yet, rerun with:

```bash
pnpm release:downloads-baseline -- --allow-unpublished
```

Use the generated Markdown file as the launch baseline for the first post-launch weekly comparison.

## Show HN Draft

Title:

```text
Show HN: Cahoots - open-source collaboration primitives for web apps
```

Body:

```text
Hi HN,

We built Cahoots, an open-source TypeScript SDK for adding multiplayer collaboration to web apps without starting from a backend-first architecture.

It includes room lifecycle, presence, live cursors, shared state, awareness, events, CRDT/Yjs support, optional end-to-end encryption, offline queueing, framework adapters for React/Vue/Svelte, prebuilt collaboration UI components, browser DevTools, and a self-hostable relay server with Docker and Redis support.

The default path is zero-backend for small rooms, using browser transports where possible. For larger or production deployments, teams can run the relay themselves instead of paying for a hosted collaboration platform.

Docs: https://docs.cahoots.dev
Demo: https://demo.cahoots.dev
GitHub: https://github.com/erayates/cahoots
npm: https://www.npmjs.com/org/cahoots

We would appreciate feedback on the API design, relay deployment model, and what examples would make adoption easier.
```

## Blog Post Draft

Use this for dev.to and Hashnode. Update the version and release link before publishing.

````markdown
# Introducing Cahoots: Open-Source Collaboration Primitives for Web Apps

Real-time collaboration is now expected in many web products, but the implementation path is still expensive: transports, peer lifecycle, presence, live cursors, shared state, conflict resolution, reconnection, UI polish, and production deployment all need to work together.

Cahoots packages those pieces as a framework-agnostic TypeScript SDK.

## What ships

- Core room lifecycle and peer registry
- Presence, cursors, shared state, awareness, and event engines
- CRDT/Yjs support for conflict-heavy shared state
- Optional AES-GCM end-to-end encryption
- Offline mutation queueing and reconnection behavior
- React, Vue, and Svelte adapters
- Prebuilt cursor and presence UI components
- Browser DevTools extension assets
- Self-hostable WebSocket relay with Docker and Redis support

## Why this exists

Hosted collaboration platforms are useful, but they can be too large a commitment for teams that only need collaboration primitives in their existing app. Cahoots keeps the default path lightweight while still offering a relay path when teams need scale or deployment control.

## Try it

Install the core package:

```bash
npm install @cahoots/core
```

Create a room:

```ts
import { createRoom } from '@cahoots/core';

const room = createRoom('demo-room', {
  presence: { name: 'Alice', color: '#4F46E5' },
});

await room.connect();
```

Explore the docs and demo:

- Docs: https://docs.cahoots.dev
- Demo: https://demo.cahoots.dev
- GitHub: https://github.com/erayates/cahoots
- npm: https://www.npmjs.com/org/cahoots

## What we want feedback on

- Is the room and engine API intuitive?
- Are the React, Vue, and Svelte adapter APIs idiomatic enough?
- What deployment examples would help you trust the relay in production?
- Which collaboration examples should we add next?
````

## X Thread Draft

```text
1/ We launched Cahoots: open-source collaboration primitives for web apps.

Add presence, live cursors, shared state, awareness, events, CRDT/Yjs sync, optional encryption, offline queueing, and a self-hostable relay without starting from a backend-first architecture.

2/ The default path is lightweight: create a room, connect peers, and use the collaboration engines from vanilla TypeScript or framework adapters.

React, Vue, and Svelte packages are included.

3/ For production scale, Cahoots includes @cahoots/relay: a WebSocket relay with Docker, CLI support, auth hooks, health checks, and Redis coordination for multi-instance deployments.

4/ There is also a UI kit for cursors/presence indicators and DevTools assets for inspecting room state, peers, events, and diffs.

5/ Docs: https://docs.cahoots.dev
Demo: https://demo.cahoots.dev
GitHub: https://github.com/erayates/cahoots
npm: https://www.npmjs.com/org/cahoots

Feedback welcome, especially on API ergonomics and deployment examples.
```

## LinkedIn Draft

```text
We launched Cahoots, an open-source TypeScript SDK for adding real-time collaboration to web apps.

It includes room lifecycle, presence, live cursors, shared state, awareness, event broadcast, CRDT/Yjs support, optional encryption, offline queueing, framework adapters for React/Vue/Svelte, prebuilt collaboration UI components, DevTools assets, and a self-hostable relay server.

The goal is to make multiplayer features practical for teams that want open-source primitives and deployment control instead of starting with a hosted collaboration platform.

Docs: https://docs.cahoots.dev
Demo: https://demo.cahoots.dev
GitHub: https://github.com/erayates/cahoots
```

## Discord Announcement Draft

```text
Cahoots is live.

Cahoots is an open-source TypeScript SDK for real-time collaboration: presence, live cursors, shared state, awareness, events, CRDT/Yjs support, optional encryption, offline queueing, React/Vue/Svelte adapters, UI components, DevTools assets, and a self-hostable relay.

Docs: https://docs.cahoots.dev
Demo: https://demo.cahoots.dev
GitHub: https://github.com/erayates/cahoots
npm: https://www.npmjs.com/org/cahoots

Please share feedback, bugs, API questions, and example requests in the project discussions.
```

## Post-Launch Checks

- [ ] Show HN URL recorded in the release notes or maintainer handoff.
- [ ] dev.to URL recorded.
- [ ] Hashnode URL recorded.
- [ ] X thread URL recorded.
- [ ] LinkedIn post URL recorded.
- [ ] Discord invite is open and linked from community docs.
- [ ] npm downloads baseline file committed or attached to release notes.
- [ ] `pnpm release:verify-public -- --tag v<release>` passes after launch.
- [ ] First 24-hour issue triage owner assigned.
