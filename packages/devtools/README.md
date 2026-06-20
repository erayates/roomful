# @roomful/devtools

Developer tooling for [Roomful](https://github.com/erayates/roomful) — a debug bridge that the core SDK exposes on `window.__roomful_devtools__`, plus the source for the Roomful browser DevTools extension (Chrome/Firefox).

The bridge powers a DevTools panel that shows connected peers and presence, a real-time state inspector with diff highlighting, an event log, room status and transport type, and simulated-peer injection for solo testing.

## Install

```bash
npm install @roomful/devtools
```

## Usage

The bridge is registered automatically by `@roomful/core` when a room is created — no setup is required to inspect a room with the Roomful DevTools browser extension. This package also exposes the serialization and diff helpers that power the extension.

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full DevTools guide.

## License

MIT
