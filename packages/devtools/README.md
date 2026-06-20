# @cahoots/devtools

Developer tooling for [Cahoots](https://github.com/erayates/cahoots) — a debug bridge that the core SDK exposes on `window.__cahoots_devtools__`, plus the source for the Cahoots browser DevTools extension (Chrome/Firefox).

The bridge powers a DevTools panel that shows connected peers and presence, a real-time state inspector with diff highlighting, an event log, room status and transport type, and simulated-peer injection for solo testing.

## Install

```bash
npm install @cahoots/devtools
```

## Usage

The bridge is registered automatically by `@cahoots/core` when a room is created — no setup is required to inspect a room with the Cahoots DevTools browser extension. This package also exposes the serialization and diff helpers that power the extension.

## Documentation

See the [Cahoots repository](https://github.com/erayates/cahoots) for the full DevTools guide.

## License

MIT
