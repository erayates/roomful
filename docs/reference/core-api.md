# Core API

Audience: users.

## Entry Point

```ts
function createRoom<TPresence extends Record<string, unknown> = Record<string, unknown>>(
  roomId: string,
  options?: RoomOptions<TPresence>,
): Room<TPresence>;
```

## `RoomOptions`

```ts
type TransportMode = 'auto' | 'webrtc' | 'websocket' | 'broadcast';

interface RoomOptions {
  transport?: TransportMode;
  presence?: Partial<PresenceData>;
  maxPeers?: number;
  stunUrls?: string[];
  relayUrl?: string;
  relayAuth?: string | (() => string | Promise<string>);
  webrtc?: {
    iceGatherTimeoutMs?: number;
    dataChannel?: {
      ordered?: boolean;
      maxRetransmits?: number;
      protocol?: string;
    };
  };
  websocket?: {
    fallbackTransport?: 'polling';
  };
  reconnect?: boolean | ReconnectOptions;
  encryption?: { key: CryptoKey } | { passphrase: string };
  debug?: boolean | DebugOptions;
}
```

Transport support in the current baseline:

- Available baseline: `auto`, `broadcast`, `webrtc`, `websocket`
- `auto` selection order is `broadcast` -> `webrtc` -> `websocket` -> `in-memory`.
- `auto` chooses BroadcastChannel when available, even if `relayUrl` is configured.
- `webrtc` uses `relayUrl` for SDP/ICE signaling and falls back to BroadcastChannel during initial connect when signaling is unavailable and same-origin broadcast is available.
- `webrtc` still fails hard when `relayUrl` is missing, `RTCPeerConnection` is unavailable, or the relay rejects the join/auth request.
- `websocket` uses `relayUrl` and `@roomful/relay` for generic room message relay.
- `websocket.fallbackTransport: 'polling'` enables connect-time fallback to relay HTTP polling when the initial WebSocket attempt is blocked or unavailable.
- Once polling fallback activates, automatic reconnect stays on polling for that room instance until you call `disconnect()`. A later manual `connect()` retries WebSocket first.
- Polling fallback does not add a public `transport: 'polling'` mode and does not change `auto` selection order.
- `relayAuth` is resolved before connect and attached to the relay socket URL as the `token` query param.
- When polling fallback is active, the same `relayAuth` token is sent on HTTP requests as `Authorization: Bearer <token>`.
- `encryption` enables optional room-scoped end-to-end encryption with Web Crypto AES-GCM.
- `encryption: { key }` accepts a pre-created AES-GCM `CryptoKey` with `encrypt` and `decrypt` usages.
- `encryption: { passphrase }` derives a non-extractable AES-GCM key with PBKDF2-SHA-256 using the room id as salt context.
- In encrypted rooms, `hello` and `welcome` remain plaintext control frames for capability bootstrap; presence, state, events, awareness, and CRDT traffic are sent as opaque encrypted envelopes.
- Relay transports route encrypted frames by room and peer metadata only; application payloads remain ciphertext to the relay.
- Wrong-key or tampered frames emit `DECRYPTION_ERROR` and are dropped without mutating room state.
- Peers that disagree on encryption mode emit `ENCRYPTION_ERROR` and do not exchange room payloads.
- Broadcast fallback is connect-time only; later signaling disconnects still emit `disconnected`.
- Default STUN server: `stun:stun.l.google.com:19302` (override with `stunUrls`).
- Default ICE gather timeout: `5000ms` (override with `webrtc.iceGatherTimeoutMs`).
- DataChannel default: ordered and reliable delivery (`ordered: true`, no `maxRetransmits` set).
- `maxPeers` is a hard cap for WebRTC mesh peer-connection context creation. When unset, it defaults to `15` for the WebRTC transport; the relay and broadcast transports stay unlimited unless `maxPeers` is set.
- BroadcastChannel transport uses a serialized JSON envelope (`source: "roomful"`, `version: 1`).
- Peer transport messages are schema-validated before room delivery.
- WebRTC data channels and relay websocket transport negotiate a peer protocol version and codec on connect.
- Binary-capable transports upgrade to MessagePack after negotiation when both peers support it; JSON remains the compatibility fallback.
- BroadcastChannel remains JSON-only by design.
- Malformed peer protocol frames are rejected at the transport boundary, logged with warn-level diagnostics, and ignored without crashing the room.
- `reconnect` is opt-in; `reconnect: true` uses defaults of `maxAttempts: 5`, `backoffMs: 100`, `backoffMultiplier: 2`, and `maxBackoffMs: 2000`.
- Automatic reconnect begins retrying within `500ms` of an unexpected transport disconnect and uses exponential backoff with internal jitter.
- In browser environments, room lifecycle automatically handles `beforeunload` and `pagehide` to trigger disconnect and propagate peer leave.
- `debug: true` enables all debug categories; object form keeps per-category booleans for `transport`, `state`, `presence`, `events`, and `performance`.
- Debug output is emitted through `console.info`, `console.warn`, and `console.error` as `[Roomful] ${component}: ${message}` with a structured payload that always includes `timestamp`, `roomId`, `category`, `component`, and `message`.
- `info` logs are suppressed when `NODE_ENV === 'production'`; `warn` and `error` still emit.

## `Room` Contract

```ts
interface Room<TPresence extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  peerId: string;
  status: RoomStatus;
  peers: Peer<TPresence>[];
  peerCount: number;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getDiagnostics(): Promise<RoomDiagnostics>;

  usePresence(): PresenceEngine<TPresence>;
  useCursors<TCursor extends Record<string, unknown> = Record<string, unknown>>(
    options?: CursorOptions,
  ): CursorEngine<TCursor>;
  useState<T>(options: StateOptions<T>): StateEngine<T>;
  useAwareness(): AwarenessEngine;
  useEvents(options?: EventOptions): EventEngine<TPresence>;
  getYDoc(): YDoc;
  getYProvider(): RoomfulYjsProvider;

  on<T extends RoomEventName>(event: T, cb: RoomEventHandler<TPresence, T>): Unsubscribe;
  off<T extends RoomEventName>(event: T, cb: RoomEventHandler<TPresence, T>): void;
}
```

`getDiagnostics()` returns a local snapshot of room runtime state. It includes transport state, resolved debug flags, peer ids, presence heartbeat status, state/offline queue metrics, custom-event counters, latest connect duration, encryption compatibility/decryption anomalies, and a `network` section with recent throughput (`messagesPerSecond`) and per-peer round-trip `latency`. It does not perform any remote calls.

Peer lifecycle notes:

- `peerId` is generated as a collision-resistant UUID v4.
- `room.peers` and `peerCount` are backed by the internal peer registry used by presence lookups.
- Local presence keeps `lastSeen` fresh with an internal `30000ms` heartbeat while the room is connected.
- Late joiners receive current peer presence during the hello/welcome exchange instead of waiting for the next heartbeat.
- Explicit peer leaves are removed immediately.
- Inferred disconnects keep the peer visible for up to `5000ms` so same-peer reconnect races can dedupe without emitting a spurious leave/join pair.
- Automatic reconnect keeps the same room instance, peer identity, and local engine state across retry attempts.

## Yjs Access

```ts
const doc = room.getYDoc();
const provider = room.getYProvider();
```

Yjs notes:

- `getYDoc()` returns the room-scoped shared `Y.Doc` instance.
- `getYProvider()` returns the room-scoped `RoomfulYjsProvider` instance with `doc`, `awareness`, `status`, and `synced`.
- New peers bootstrap document state via Yjs state-vector exchange and receive the current document snapshot during initial sync.
- CRDT updates stay as `Uint8Array` in-process and use the negotiated peer protocol codec on the wire, with JSON-safe array fallback where binary transport is unavailable.
- For `y-prosemirror`-style editors, use `room.getYDoc().getXmlFragment('prosemirror')` and `room.getYProvider().awareness`.
- For `y-codemirror`-style editors, use `room.getYDoc().getText('content')` and `room.getYProvider().awareness`.

## Event Names

```ts
// Peer lifecycle
room.on('peer:join', (peer) => {});
room.on('peer:leave', (peer) => {});
room.on('peer:update', (peer) => {});

// Connection lifecycle
room.on('connected', () => {});
room.on('offline', ({ reason }) => {});
room.on('online', () => {});
room.on('disconnected', ({ reason }) => {});
room.on('reconnecting', ({ attempt }) => {});
room.on('error', (error) => {});

// Room lifecycle
room.on('room:full', () => {});
room.on('room:empty', () => {});
```

Connection event semantics:

- `error`: emitted when transport/runtime errors are surfaced to room lifecycle.
- `offline`: emitted once when an established connection drops unexpectedly and the room enters its reconnect window.
- `online`: emitted once after that reconnect window fully recovers and any queued offline work has finished replaying.
- `disconnected`: emitted for manual disconnect and transport-level disconnects with a reason payload.
- With `reconnect` enabled, unexpected transport disconnects emit `reconnecting` during retries and defer `disconnected` until retries are exhausted.
- A successful automatic reconnect emits `connected` again without changing `peerId` or recreating engine instances.

Offline queue semantics:

- LWW state mutations (`set`, `patch`, `undo`, `reset`) made while disconnected after a live session are applied locally immediately and queued in memory for replay.
- Queued state mutations replay in append order on reconnect and still respect LWW conflict resolution before they are re-sent.
- Custom events emitted while disconnected are also queued and replayed in order.
- The event portion of the offline queue keeps only the newest `100` queued events to avoid unbounded memory growth.
- UI state subscribers can detect unsaved local state through `StateChangeMeta.pending` and `StateChangeMeta.queuedMutationCount`.

## Minimal Flow

```ts
import { createRoom } from '@roomful/core';

const room = createRoom('doc-abc123', {
  transport: 'webrtc',
  presence: { name: 'Alice', color: '#7C3AED' },
  maxPeers: 10,
  relayUrl: 'ws://localhost:8787',
  relayAuth: async () => 'signed-token',
  webrtc: {
    iceGatherTimeoutMs: 5000,
    dataChannel: { ordered: true, protocol: 'roomful-v1' },
  },
  reconnect: { maxAttempts: 5, backoffMs: 1000 },
});

await room.connect();
```

## Related Docs

- [Reference index](README.md)
- [Presence engine](engines-presence.md)
- [Cursor engine](engines-cursors.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Types](types.md)
- [Docs index](../README.md)
