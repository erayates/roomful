# Installation

Audience: users.

## Requirements

### Browser runtime

- Chrome/Chromium 80+
- Firefox 75+
- Safari 14+
- Edge 80+

### Tooling

- Node.js 18+
- npm or pnpm

## Packages

Install only what you need.

```bash
# Core SDK (required)
npm install @roomful/core

# CRDT / Yjs support (required only when using strategy: 'crdt' or Yjs APIs)
npm install yjs y-protocols

# Framework adapters (optional)
npm install @roomful/react
npm install @roomful/vue
npm install @roomful/svelte

# Prebuilt collaboration UI (optional)
npm install @roomful/cursors

# Self-hosted relay server (optional)
npm install @roomful/relay

# Relay CLI (optional)
npm install -g @roomful/relay
```

## Environment Constraints

- WebRTC-based collaboration depends on browser support and network policy.
- Cross-network sessions need STUN/TURN configuration for production.
- SSR/Node environments can document configuration but cannot run browser WebRTC transport directly.

## CRDT Dependency Note

- `@roomful/core` declares `yjs` and `y-protocols` as peer dependencies.
- Install them when you use `room.getYDoc()`, `room.getYProvider()`, or `useState({ strategy: 'crdt' })`.
- If you only use `lww` or `custom` state strategies, no extra CRDT packages are needed beyond the base install.

## Versioning Note

The project is pre-`v1.0`. Verify package versions and release notes before adopting APIs in production.

## Related Docs

- [Quickstart](quickstart.md)
- [Rooms and transports](rooms-and-transports.md)
- [Core API](../reference/core-api.md)
- [Docs index](../README.md)
