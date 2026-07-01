# Type Reference

Audience: users and contributors.

Canonical type contracts for the stable `v1.0` API surface.

## Core Types

```ts
export type RoomStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface Peer {
  id: string;
  joinedAt: number;
  lastSeen: number;
  name?: string;
  color?: string;
  avatar?: string;
  [key: string]: unknown;
}

export type PeerWithPresence<TPresence extends Record<string, unknown>> = Peer & Partial<TPresence>;

export interface RoomfulError extends Error {
  code:
    | 'ROOM_FULL'
    | 'AUTH_FAILED'
    | 'NETWORK_ERROR'
    | 'ENCRYPTION_ERROR'
    | 'DECRYPTION_ERROR'
    | 'INVALID_STATE';
  recoverable: boolean;
}

export type Unsubscribe = () => void;

export type RoomfulYjsProviderStatus = 'connected' | 'disconnected';

export interface RoomfulYjsProviderEventMap {
  status: {
    status: RoomfulYjsProviderStatus;
  };
  sync: {
    synced: boolean;
  };
}

export interface RoomfulYjsProvider {
  readonly doc: YDoc;
  readonly awareness: YjsAwareness;
  readonly synced: boolean;
  readonly status: RoomfulYjsProviderStatus;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  destroy(): Promise<void>;

  on<T extends keyof RoomfulYjsProviderEventMap>(
    event: T,
    cb: (payload: RoomfulYjsProviderEventMap[T]) => void,
  ): Unsubscribe;
  off<T extends keyof RoomfulYjsProviderEventMap>(
    event: T,
    cb: (payload: RoomfulYjsProviderEventMap[T]) => void,
  ): void;
}

export type RelayAuthToken = string | (() => string | Promise<string>);

export interface WebRTCDataChannelOptions {
  ordered?: boolean;
  maxRetransmits?: number;
  protocol?: string;
}

export interface WebRTCOptions {
  iceGatherTimeoutMs?: number;
  dataChannel?: WebRTCDataChannelOptions;
}

export interface ReconnectOptions {
  maxAttempts?: number;
  backoffMs?: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
}

export interface DebugOptions {
  transport?: boolean;
  state?: boolean;
  presence?: boolean;
  events?: boolean;
  performance?: boolean;
}

export type RoomEventName =
  | 'connected'
  | 'offline'
  | 'online'
  | 'disconnected'
  | 'reconnecting'
  | 'error'
  | 'peer:join'
  | 'peer:leave'
  | 'peer:update'
  | 'room:full'
  | 'room:empty';

export interface RoomEventMap<TPresence extends PresenceData = PresenceData> {
  connected: void;
  offline: { reason?: string };
  online: void;
  disconnected: { reason?: string };
  reconnecting: { attempt: number };
  error: RoomfulError;
  'peer:join': Peer<TPresence>;
  'peer:leave': Peer<TPresence>;
  'peer:update': Peer<TPresence>;
  'room:full': void;
  'room:empty': void;
}

export interface StateChangeMeta {
  reason: 'set' | 'patch' | 'undo' | 'reset';
  changedBy: string;
  timestamp: number;
  pending: boolean;
  queuedMutationCount: number;
}

export interface EncryptionKeyOptions {
  key: CryptoKey;
}

export interface EncryptionPassphraseOptions {
  passphrase: string;
}

export type EncryptionOptions = EncryptionKeyOptions | EncryptionPassphraseOptions;
```

Diagnostics note:

- `debug?: boolean | DebugOptions` remains the only public logging entry point.
- `debug: true` resolves all debug categories to `true`.
- `Room#getDiagnostics(): Promise<RoomDiagnostics>` returns a local snapshot with transport, debug, peers, presence, state, events, encryption, and network sections. The network section is `{ messagesPerSecond: number; latency: Record<string, number> }`, where `latency` maps remote `peerId` to round-trip milliseconds.
- `RoomDiagnosticsTransport.current`, `RoomDiagnosticsTransport.lastDisconnectReason`, `RoomDiagnosticsState.strategy`, `RoomDiagnosticsState.stateSizeBytes`, and `RoomDiagnosticsEvents.latestConnectDurationMs` can be `null` when unavailable.

Transport baseline note:

- `RoomStatus`, `Peer`, and `RoomfulError` are now implemented in the core runtime.
- `Peer.id` is a UUID v4 generated from Web Crypto.
- Broadcast-based peer discovery is available via `transport: 'auto' | 'broadcast'`.
- WebRTC mesh transport is available via `transport: 'webrtc'` with relay signaling, plus connect-time BroadcastChannel fallback when signaling is unavailable on the same origin.
- `relayUrl` remains the canonical signaling URL for real WebRTC negotiation.
- Relay-backed room messaging is available via `transport: 'websocket'`.
- Relay-backed room messaging over HTTP/3 is available via `transport: 'webtransport'` (same relay protocol as `websocket`, carried on a QUIC bidirectional stream; opt-in only, not selected by `auto`).
- Optional end-to-end encryption is available through `encryption: { key }` or `encryption: { passphrase }`.
- `RoomfulError.code` is one of six values: `ROOM_FULL` (room is at capacity), `AUTH_FAILED` (relay rejected the join/auth request), `NETWORK_ERROR` (transport/connectivity failure), `ENCRYPTION_ERROR` (encryption setup or configuration failed, such as a bad key/passphrase or missing WebCrypto), `DECRYPTION_ERROR` (a peer message failed to decrypt, for example with the wrong key), and `INVALID_STATE` (an invalid state operation, such as a failed CRDT persist or an unsupported strategy).
- `DECRYPTION_ERROR` is emitted when an encrypted payload cannot be authenticated or decrypted with the local room key.
- `transport: 'auto'` selects `broadcast`, then `webrtc`, then `websocket`, and finally `in-memory` when no browser-capable transport is available.
- The internal peer wire protocol is versioned and codec-negotiated per peer; public room/event types stay unchanged.
- BroadcastChannel payloads remain a versioned JSON envelope.
- WebRTC and relay websocket transports can negotiate MessagePack after connect, with JSON fallback for legacy or json-only peers.
- Automatic reconnect is opt-in via `reconnect`; `reconnect: true` resolves to the built-in exponential backoff strategy.
- Browser room instances auto-register unload handlers (`beforeunload`, `pagehide`) to propagate `peer:leave`.
- Inferred disconnects keep a peer in registry-backed snapshots for up to `5000ms` before removal so reconnect races can dedupe cleanly.
- Successful automatic reconnect keeps the same room instance, `peerId`, and local engine state.
- `offline` and `online` are room lifecycle events for unexpected disconnect windows; `connected` and `disconnected` remain the transport/session lifecycle markers.
- `StateChangeMeta.pending` and `StateChangeMeta.queuedMutationCount` expose unsaved queued LWW mutations to subscribers.
- `debug: true` enables all debug categories, while `DebugOptions` keeps category-level logging control without adding any separate logger configuration type.

Yjs baseline note:

- `RoomfulYjsProvider` is implemented in `@roomful/core`.
- `doc` exposes the shared `Y.Doc` used by `room.getYDoc()`.
- `awareness` exposes the shared Yjs awareness instance used by editor bindings and room awareness sync.
- `synced` flips to `true` when the provider finishes its pending peer sync handshake for the current connection.
- `status` tracks room-backed Yjs connectivity as `'connected' | 'disconnected'`.

## Engine Option Types

```ts
export interface CursorOptions {
  throttleMs?: number;
  smoothing?: boolean;
  idleAfterMs?: number;
}

export interface StateOptions<T> {
  initialValue: T;
  strategy?: 'lww' | 'crdt' | 'custom';
  persist?: boolean;
  merge?: (a: T, b: T) => T;
}

export interface EventOptions {
  loopback?: boolean;
}
```

Cursor option notes:

- `smoothing` defaults to `true` and toggles CSS-transition interpolation for rendered cursors.

Event option notes:

- `loopback` defaults to `false`.
- Events are reliably delivered over all transports.

## Change Discipline

- Keep this file synchronized with public API docs.
- Document type-level breaking changes in `CHANGELOG.md`.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [Presence engine](engines-presence.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Docs index](../README.md)
