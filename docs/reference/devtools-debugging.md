# Devtools and Debugging

Audience: users and contributors.

## DevTools Extension

`@flockjs/devtools` now ships a browser DevTools extension bundle for Chrome and Firefox.

Build the extension artifacts:

```bash
pnpm --filter @flockjs/devtools build
```

Output artifacts land in `packages/devtools/dist/browser/`:

- `chrome/` unpacked Chrome extension
- `firefox/` temporary Firefox extension
- `flockjs-devtools-chrome.zip` store-ready Chrome archive
- `flockjs-devtools-firefox.zip` store-ready Firefox archive
- `listings/` store listing copy and manual QA notes

The panel reads page diagnostics from the bridge injected by the core SDK at `window.__flockjs_devtools__`.

## Debug Configuration

```ts
const room = createRoom('my-room', {
  debug: true,
});
```

`debug: true` enables all debug categories. `debug: { ... }` keeps category-level control for:

- `transport`
- `state`
- `presence`
- `events`
- `performance`

Logs are console-backed and emitted as `console.info`, `console.warn`, or `console.error` with a `[FlockJS]` prefix plus a structured payload. Every payload includes:

- `timestamp`
- `roomId`
- `category`
- `component`
- `message`

Normal lifecycle traces use `info`, malformed or ignored frames use `warn`, and surfaced runtime failures use `error`. In `NODE_ENV=production`, `info` logs are suppressed while `warn` and `error` still emit.

Transport selection, protocol negotiation, reconnect attempts, state mutations, presence sync, event delivery, and queue/performance counters all use the same structured logger contract.

## What the Panel Shows

- connected peers with serialized presence payloads
- shared state with diff highlighting
- recent event traffic with timestamps and sender metadata
- room status and active transport
- a simulated peer toggle for solo testing

## Diagnostics Snapshot

```ts
const diagnostics = await room.getDiagnostics();

console.log(diagnostics);
// {
//   timestamp: 1710000000000,
//   roomId: 'my-room',
//   peerId: 'peer-a',
//   status: 'connected',
//   transport: {
//     current: 'webrtc',
//     lastDisconnectReason: null,
//     reconnectAttempt: 0,
//   },
//   debug: {
//     transport: true,
//     state: true,
//     presence: true,
//     events: true,
//     performance: true,
//     productionInfoSuppressed: false,
//   },
//   peers: {
//     remoteCount: 2,
//     remotePeerIds: ['peer-b', 'peer-c'],
//   },
//   presence: {
//     selfLastSeen: 1710000000000,
//     heartbeatActive: true,
//   },
//   state: {
//     configured: true,
//     strategy: 'lww',
//     persistenceEnabled: false,
//     queuedMutationCount: 0,
//     offlineReplayInProgress: false,
//     stateSizeBytes: 1204,
//   },
//   events: {
//     registeredEventNames: ['ping'],
//     messagesSent: 4,
//     messagesReceived: 3,
//     broadcastsSent: 3,
//     directSends: 1,
//     latestConnectDurationMs: 18,
//   },
//   encryption: {
//     enabled: false,
//     incompatiblePeerIds: [],
//     decryptionErrorPeerIds: [],
//   },
//   network: {
//     messagesPerSecond: 12,
//     latency: { 'peer-b': 34, 'peer-c': 41 },
//   },
// }
```

The `network` section reports a recent throughput estimate (`messagesPerSecond`) and a `latency` map of remote `peerId` to round-trip milliseconds.

## Common Issues

| Symptom                            | Likely cause                | Action                            |
| ---------------------------------- | --------------------------- | --------------------------------- |
| Cross-network peers do not connect | STUN/TURN path unavailable  | configure reliable STUN/TURN      |
| State sync feels slow              | oversized state payloads    | prefer `patch` and reduce payload |
| Cursor jitter                      | update frequency too high   | throttle cursor updates           |
| Room saturates quickly             | `maxPeers` too low for mesh | increase limit or move to relay   |
| Duplicate reconnect side effects   | stale lifecycle handling    | normalize reconnect transitions   |

## Triage Checklist

1. Verify all peers use the exact same `roomId`.
2. Inspect selected transport and fallback path.
3. Enable only required debug channels.
4. Re-test reconnection with controlled disconnect simulation.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [Performance](performance.md)
- [Release process](../project/release-process.md)
- [Docs index](../README.md)
