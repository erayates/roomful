# @flockjs/devtools

Developer tooling for [FlockJS](https://github.com/erayates/flockjs) — a debug bridge that the core SDK exposes on `window.__flockjs_devtools__`, plus the source for the FlockJS browser DevTools extension (Chrome/Firefox).

The bridge powers a DevTools panel that shows connected peers and presence, a real-time state inspector with diff highlighting, an event log, room status and transport type, and simulated-peer injection for solo testing.

## Install

```bash
npm install @flockjs/devtools
```

## Usage

The bridge is registered automatically by `@flockjs/core` when a room is created — no setup is required to inspect a room with the FlockJS DevTools browser extension. This package also exposes the serialization and diff helpers that power the extension.

## Documentation

See the [FlockJS repository](https://github.com/erayates/flockjs) for the full DevTools guide.

## License

MIT
