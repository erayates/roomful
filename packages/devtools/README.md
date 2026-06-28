# @roomful/devtools

Developer tooling for [Roomful](https://github.com/erayates/roomful) — a debug bridge that the core SDK exposes on `window.__roomful_devtools__`, plus the source for the Roomful browser DevTools extension (Chrome/Firefox).

The bridge powers a DevTools panel that shows connected peers and presence, a real-time state inspector with diff highlighting, an event log, room status and transport type, and simulated-peer injection for solo testing.

> **Public beta** — install with the `@beta` tag; the API is stable but may still change before 1.0.

## Install

```bash
npm install @roomful/devtools@beta
```

## Usage

The bridge is registered automatically by `@roomful/core` when a room is created — no setup is required to inspect a room with the Roomful DevTools browser extension. This package also exposes the serialization and diff helpers that power the extension.

> **Experimental:** the `window.__roomful_devtools__` bridge is experimental — its single-integer protocol version carries no negotiation and may change. The pure `serializeDevtoolsValue` and `diffSerializedState` helpers are stable.

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full DevTools guide.

## License

MIT
