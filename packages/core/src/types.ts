import type { Awareness as YjsAwareness } from 'y-protocols/awareness';
import type { Doc as YDoc } from 'yjs';

import type { ActivityStorageAdapter } from './engines/activity-storage';
import type { CommentsStorageAdapter } from './engines/comments-storage';
import type { RoomfulError, RoomfulErrorCode } from './roomful-error';
import type { RoomTransportSignal, TransportKind } from './transports/transport';

/**
 * Describes arbitrary presence metadata attached to a peer.
 */
export type PresenceData = Record<string, unknown>;

/**
 * Represents the lifecycle state of a room connection.
 */
export type RoomStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

/**
 * Selects the preferred transport strategy for a room.
 *
 * Non-exhaustive; new codes may be added in minor releases — handle a default case.
 */
export type TransportMode = 'auto' | 'webrtc' | 'websocket' | 'webtransport' | 'broadcast';

/**
 * Supplies relay authentication as a static token or token factory.
 */
export type RelayAuthToken = string | (() => string | Promise<string>);

/**
 * Configures the RTC data channel used by the WebRTC transport.
 */
export interface WebRTCDataChannelOptions {
  /**
   * Preserves message ordering when `true`.
   */
  ordered?: boolean;

  /**
   * Caps retransmission attempts for unreliable channels.
   */
  maxRetransmits?: number;

  /**
   * Sets the negotiated protocol label for the data channel.
   */
  protocol?: string;
}

/**
 * Configures WebRTC transport behavior.
 */
export interface WebRTCOptions {
  /**
   * Limits how long ICE gathering is allowed to run before fallback logic continues.
   */
  iceGatherTimeoutMs?: number;

  /**
   * Overrides the RTC data channel settings.
   */
  dataChannel?: WebRTCDataChannelOptions;
}

/**
 * Configures WebSocket transport fallback behavior.
 */
export interface WebSocketOptions {
  /**
   * Enables long-polling fallback when the WebSocket transport cannot be established.
   */
  fallbackTransport?: 'polling';
}

/**
 * Configures reconnect timing and attempt limits.
 */
export interface ReconnectOptions {
  /**
   * Sets the maximum reconnect attempts before the room stops retrying.
   */
  maxAttempts?: number;

  /**
   * Sets the initial reconnect delay in milliseconds.
   */
  backoffMs?: number;

  /**
   * Multiplies the reconnect delay after each failed attempt.
   */
  backoffMultiplier?: number;

  /**
   * Caps the reconnect delay in milliseconds.
   */
  maxBackoffMs?: number;
}

/**
 * Configures room encryption with a pre-derived `CryptoKey`.
 */
export interface EncryptionKeyOptions {
  /**
   * Supplies the key used to encrypt room payloads.
   */
  key: CryptoKey;
}

/**
 * Configures room encryption with a passphrase-derived key.
 */
export interface EncryptionPassphraseOptions {
  /**
   * Supplies the passphrase used to derive the encryption key.
   */
  passphrase: string;
}

/**
 * Enables room encryption with either a `CryptoKey` or passphrase.
 */
export type EncryptionOptions = EncryptionKeyOptions | EncryptionPassphraseOptions;

/**
 * Enables verbose debug logging for specific room subsystems.
 */
export interface DebugOptions {
  /**
   * Emits transport selection and signaling diagnostics.
   */
  transport?: boolean;

  /**
   * Emits shared-state diagnostics.
   */
  state?: boolean;

  /**
   * Emits presence synchronization diagnostics.
   */
  presence?: boolean;

  /**
   * Emits custom event diagnostics.
   */
  events?: boolean;

  /**
   * Emits timing and performance diagnostics.
   */
  performance?: boolean;
}

/**
 * Captures transport-related diagnostics for a room.
 */
export interface RoomDiagnosticsTransport {
  /**
   * Reports the currently active transport implementation.
   */
  current: TransportKind | null;

  /**
   * Reports the last disconnect reason observed by the room.
   */
  lastDisconnectReason: string | null;

  /**
   * Reports the reconnect attempt currently in flight.
   */
  reconnectAttempt: number;
}

/**
 * Captures the effective debug flags for a room.
 */
export interface RoomDiagnosticsDebug {
  /**
   * Indicates whether transport debug logging is enabled.
   */
  transport: boolean;

  /**
   * Indicates whether state debug logging is enabled.
   */
  state: boolean;

  /**
   * Indicates whether presence debug logging is enabled.
   */
  presence: boolean;

  /**
   * Indicates whether custom event debug logging is enabled.
   */
  events: boolean;

  /**
   * Indicates whether performance debug logging is enabled.
   */
  performance: boolean;

  /**
   * Indicates whether production-only environment details were intentionally suppressed.
   */
  productionInfoSuppressed: boolean;
}

/**
 * Captures peer registry diagnostics for a room.
 */
export interface RoomDiagnosticsPeers {
  /**
   * Counts remote peers currently tracked by the room.
   */
  remoteCount: number;

  /**
   * Lists remote peer identifiers currently tracked by the room.
   */
  remotePeerIds: string[];
}

/**
 * Captures local presence diagnostics for a room.
 */
export interface RoomDiagnosticsPresence {
  /**
   * Records the last local presence heartbeat timestamp.
   */
  selfLastSeen: number;

  /**
   * Indicates whether the heartbeat loop is active.
   */
  heartbeatActive: boolean;
}

/**
 * Captures shared-state diagnostics for a room.
 */
export interface RoomDiagnosticsState {
  /**
   * Indicates whether shared state has been configured.
   */
  configured: boolean;

  /**
   * Reports the active shared-state strategy, when configured.
   */
  strategy: 'lww' | 'crdt' | 'custom' | null;

  /**
   * Indicates whether local persistence is enabled.
   */
  persistenceEnabled: boolean;

  /**
   * Counts queued offline state mutations.
   */
  queuedMutationCount: number;

  /**
   * Indicates whether queued offline state is currently replaying.
   */
  offlineReplayInProgress: boolean;

  /**
   * Reports the serialized state size in bytes when available.
   */
  stateSizeBytes: number | null;
}

/**
 * Captures custom-event diagnostics for a room.
 */
export interface RoomDiagnosticsEvents {
  /**
   * Lists event names with registered listeners.
   */
  registeredEventNames: string[];

  /**
   * Counts outbound event messages sent by this room.
   */
  messagesSent: number;

  /**
   * Counts inbound event messages received by this room.
   */
  messagesReceived: number;

  /**
   * Counts broadcast event messages sent by this room.
   */
  broadcastsSent: number;

  /**
   * Counts direct event messages sent to a single peer.
   */
  directSends: number;

  /**
   * Records the most recent connection duration when available.
   */
  latestConnectDurationMs: number | null;
}

/**
 * Captures encryption-related diagnostics for a room.
 */
export interface RoomDiagnosticsEncryption {
  /**
   * Indicates whether end-to-end encryption is enabled.
   */
  enabled: boolean;

  /**
   * Lists peers that negotiated an incompatible encryption setup.
   */
  incompatiblePeerIds: string[];

  /**
   * Lists peers that produced decryption failures.
   */
  decryptionErrorPeerIds: string[];
}

/**
 * Captures network-throughput and per-peer latency diagnostics for a room.
 */
export interface RoomDiagnosticsNetwork {
  /**
   * Estimates recent room message throughput in messages per second, averaged
   * over a short sliding window across inbound and outbound signals.
   */
  messagesPerSecond: number;

  /**
   * Maps each remote peer ID to its most recently measured round-trip latency
   * in milliseconds. Peers without a completed measurement are omitted.
   */
  latency: Record<string, number>;
}

/**
 * Aggregates room diagnostics across transports, presence, state, and events.
 */
export interface RoomDiagnostics {
  /**
   * Records when the diagnostics snapshot was created.
   */
  timestamp: number;

  /**
   * Identifies the room that produced this snapshot.
   */
  roomId: string;

  /**
   * Identifies the local peer for this snapshot.
   */
  peerId: string;

  /**
   * Reports the current room connection status.
   */
  status: RoomStatus;

  /**
   * Reports transport-related diagnostics.
   */
  transport: RoomDiagnosticsTransport;

  /**
   * Reports the effective debug configuration.
   */
  debug: RoomDiagnosticsDebug;

  /**
   * Reports peer registry diagnostics.
   */
  peers: RoomDiagnosticsPeers;

  /**
   * Reports presence diagnostics.
   */
  presence: RoomDiagnosticsPresence;

  /**
   * Reports shared-state diagnostics.
   */
  state: RoomDiagnosticsState;

  /**
   * Reports custom-event diagnostics.
   */
  events: RoomDiagnosticsEvents;

  /**
   * Reports encryption diagnostics.
   */
  encryption: RoomDiagnosticsEncryption;

  /**
   * Reports network throughput and per-peer latency diagnostics.
   */
  network: RoomDiagnosticsNetwork;
}

/**
 * Configures room creation.
 *
 * @typeParam TPresence - The local and remote presence shape carried by the room.
 */
export interface RoomOptions<TPresence extends PresenceData = PresenceData> {
  /**
   * Selects the preferred transport strategy.
   */
  transport?: TransportMode;

  /**
   * Seeds the initial local presence payload.
   */
  presence?: Partial<TPresence>;

  /**
   * Caps the number of peers allowed in the room.
   */
  maxPeers?: number;

  /**
   * Supplies custom STUN server URLs for WebRTC sessions.
   */
  stunUrls?: string[];

  /**
   * Overrides the relay URL used for signaling and fallback transports.
   */
  relayUrl?: string;

  /**
   * Supplies relay authentication as a token or async token factory.
   */
  relayAuth?: RelayAuthToken;

  /**
   * Enables reconnect behavior or custom reconnect timing.
   */
  reconnect?: boolean | ReconnectOptions;

  /**
   * Configures WebRTC-specific behavior.
   */
  webrtc?: WebRTCOptions;

  /**
   * Configures WebSocket-specific behavior.
   */
  websocket?: WebSocketOptions;

  /**
   * Enables payload encryption.
   */
  encryption?: EncryptionOptions;

  /**
   * Enables broad debug logging or fine-grained debug flags.
   */
  debug?: boolean | DebugOptions;
}

/**
 * Describes a local or remote peer known to a room.
 *
 * @typeParam TPresence - The custom presence shape merged into the peer record.
 */
export type Peer<TPresence extends PresenceData = PresenceData> = {
  /**
   * Identifies the peer across transports.
   */
  id: string;

  /**
   * Records when the peer joined the room.
   */
  joinedAt: number;

  /**
   * Records the last time the peer was observed.
   */
  lastSeen: number;

  /**
   * Exposes a human-readable peer name when available.
   */
  name?: string;

  /**
   * Exposes the peer color when available.
   */
  color?: string;

  /**
   * Exposes the peer avatar URL when available.
   */
  avatar?: string;
} & Partial<TPresence>;

/**
 * Re-exports the public `RoomfulError` class type.
 */
export type { RoomfulError, RoomfulErrorCode };

/**
 * Unsubscribes a previously registered listener.
 *
 * @returns Nothing.
 */
export type Unsubscribe = () => void;

/**
 * Represents the connection state of the Yjs provider.
 */
export type RoomfulYjsProviderStatus = 'connected' | 'disconnected';

/**
 * Maps Yjs provider event names to payloads.
 */
export interface RoomfulYjsProviderEventMap {
  /**
   * Fires when the provider connection status changes.
   */
  status: {
    /**
     * Reports the new provider status.
     */
    status: RoomfulYjsProviderStatus;
  };

  /**
   * Fires when the provider sync state changes.
   */
  sync: {
    /**
     * Indicates whether the provider has synced its document.
     */
    synced: boolean;
  };
}

/**
 * Names the supported Yjs provider events.
 */
export type RoomfulYjsProviderEventName = keyof RoomfulYjsProviderEventMap;

/**
 * Handles a Yjs provider event.
 *
 * @typeParam TEvent - The event name being handled.
 * @param payload - The payload for the event.
 * @returns Nothing.
 */
export type RoomfulYjsProviderEventHandler<TEvent extends RoomfulYjsProviderEventName> = (
  payload: RoomfulYjsProviderEventMap[TEvent],
) => void;

/**
 * Exposes the Yjs document and provider used by CRDT state synchronization.
 */
export interface RoomfulYjsProvider {
  /**
   * Exposes the shared Yjs document.
   */
  readonly doc: YDoc;

  /**
   * Exposes the Yjs awareness instance.
   */
  readonly awareness: YjsAwareness;

  /**
   * Indicates whether the provider has completed an initial sync.
   */
  readonly synced: boolean;

  /**
   * Reports the provider connection status.
   */
  readonly status: RoomfulYjsProviderStatus;

  /**
   * Opens the provider connection.
   *
   * @returns A promise that resolves when the provider has started connecting.
   */
  connect(): Promise<void>;

  /**
   * Closes the provider connection.
   *
   * @returns A promise that resolves when disconnect teardown finishes.
   */
  disconnect(): Promise<void>;

  /**
   * Destroys the provider and releases resources.
   *
   * @returns A promise that resolves when teardown finishes.
   */
  destroy(): Promise<void>;

  /**
   * Subscribes to provider lifecycle events.
   *
   * @typeParam TEvent - The provider event name to subscribe to.
   * @param event - The provider event name to observe.
   * @param cb - The callback invoked with the matching payload.
   * @returns A function that removes the listener.
   */
  on<TEvent extends RoomfulYjsProviderEventName>(
    event: TEvent,
    cb: RoomfulYjsProviderEventHandler<TEvent>,
  ): Unsubscribe;

  /**
   * Removes a provider lifecycle listener.
   *
   * @typeParam TEvent - The provider event name being removed.
   * @param event - The provider event name to unsubscribe from.
   * @param cb - The callback to remove.
   * @returns Nothing.
   */
  off<TEvent extends RoomfulYjsProviderEventName>(
    event: TEvent,
    cb: RoomfulYjsProviderEventHandler<TEvent>,
  ): void;
}

/**
 * Names the built-in room lifecycle events.
 *
 * Non-exhaustive; new codes may be added in minor releases — handle a default case.
 */
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

/**
 * Maps built-in room event names to payloads.
 *
 * @typeParam TPresence - The custom peer presence shape.
 */
export interface RoomEventMap<TPresence extends PresenceData = PresenceData> {
  /**
   * Fires after the room connects successfully.
   */
  connected: void;

  /**
   * Fires when the room detects the browser has gone offline.
   */
  offline: { reason?: string };

  /**
   * Fires when the browser returns online.
   */
  online: void;

  /**
   * Fires after the room disconnects.
   */
  disconnected: { reason?: string };

  /**
   * Fires before another reconnect attempt starts.
   */
  reconnecting: { attempt: number };

  /**
   * Fires when the room encounters an operational error.
   */
  error: RoomfulError;

  /**
   * Fires when a remote peer joins.
   */
  'peer:join': Peer<TPresence>;

  /**
   * Fires when a remote peer leaves.
   */
  'peer:leave': Peer<TPresence>;

  /**
   * Fires when a remote peer updates its presence.
   */
  'peer:update': Peer<TPresence>;

  /**
   * Fires when a join attempt fails because the room is full.
   */
  'room:full': void;

  /**
   * Fires when the room becomes empty apart from the local peer.
   */
  'room:empty': void;
}

/**
 * Handles a built-in room event.
 *
 * @typeParam TPresence - The custom peer presence shape.
 * @typeParam TEvent - The event name being handled.
 * @param payload - The payload for the event.
 * @returns Nothing.
 */
export type RoomEventHandler<TPresence extends PresenceData, TEvent extends RoomEventName> = (
  payload: RoomEventMap<TPresence>[TEvent],
) => void;

/**
 * Configures cursor tracking behavior.
 */
export interface CursorOptions {
  /**
   * Throttles cursor broadcasts in milliseconds.
   */
  throttleMs?: number;

  /**
   * Enables cursor interpolation when rendered.
   */
  smoothing?: boolean;

  /**
   * Marks the local cursor idle after the given number of milliseconds.
   */
  idleAfterMs?: number;
}

/**
 * Configures DOM cursor rendering.
 */
export interface CursorRenderOptions {
  /**
   * Selects the container element or selector for rendered cursors.
   */
  container?: string | HTMLElement;

  /**
   * Chooses the cursor marker style. Use `'none'` to disable the built-in
   * renderer while keeping cursor tracking active.
   */
  style?: 'default' | 'arrow' | 'dot' | 'pointer' | 'none' | (string & {});

  /**
   * Shows peer labels when `true`.
   */
  showName?: boolean;

  /**
   * Keeps idle cursors visible when `true`.
   */
  showIdle?: boolean;

  /**
   * Overrides the idle timeout used by the renderer.
   */
  idleTimeout?: number;

  /**
   * Sets the z-index applied to rendered cursor elements.
   */
  zIndex?: number;

  /**
   * Called with each peer cursor element when it is first created, allowing
   * custom decoration of the rendered node.
   */
  onMount?: (element: HTMLElement) => void;
}

/**
 * Describes arbitrary cursor metadata attached to a position update.
 */
export type CursorData = Record<string, unknown>;

/**
 * Describes the built-in cursor position fields shared by all peers.
 */
export interface CursorBasePosition {
  /**
   * Identifies the peer that owns the cursor.
   */
  userId: string;

  /**
   * Supplies the peer display name.
   */
  name: string;

  /**
   * Supplies the peer color.
   */
  color: string;

  /**
   * Supplies the normalized X coordinate within the mounted element.
   */
  x: number;

  /**
   * Supplies the normalized Y coordinate within the mounted element.
   */
  y: number;

  /**
   * Supplies the absolute X coordinate within the mounted element.
   */
  xAbsolute: number;

  /**
   * Supplies the absolute Y coordinate within the mounted element.
   */
  yAbsolute: number;

  /**
   * Identifies the focused element when available.
   */
  element?: string;

  /**
   * Indicates whether the cursor is currently idle.
   */
  idle: boolean;
}

type CursorExtension<TCursor extends CursorData> = Omit<Partial<TCursor>, keyof CursorBasePosition>;

/**
 * Merges the base cursor shape with custom cursor metadata.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 */
export type CursorPosition<TCursor extends CursorData = CursorData> = CursorBasePosition &
  CursorExtension<TCursor>;

/**
 * Configures shared state creation.
 *
 * @typeParam T - The shared state value type.
 */
export interface StateOptions<T> {
  /**
   * Seeds the shared state value when the room starts.
   */
  initialValue: T;

  /**
   * Chooses the state synchronization strategy.
   */
  strategy?: 'lww' | 'crdt' | 'custom';

  /**
   * Persists local last-writer-wins state between sessions when `true`.
   */
  persist?: boolean;

  /**
   * Resolves conflicts for custom merge strategies.
   */
  merge?: (a: T, b: T) => T;
}

/**
 * Describes metadata attached to a shared-state change.
 */
export interface StateChangeMeta {
  /**
   * Identifies the mutation that produced the change.
   *
   * Non-exhaustive; new codes may be added in minor releases — handle a default case.
   */
  reason: 'set' | 'patch' | 'undo' | 'reset';

  /**
   * Identifies the peer that produced the latest applied change.
   */
  changedBy: string;

  /**
   * Records when the latest applied change occurred.
   */
  timestamp: number;

  /**
   * Indicates whether the value is waiting to sync remotely.
   */
  pending: boolean;

  /**
   * Counts queued offline mutations still waiting to replay.
   */
  queuedMutationCount: number;
}

/**
 * Configures custom event behavior.
 */
export interface EventOptions {
  /**
   * Echoes emitted events back to the local room when `true`.
   */
  loopback?: boolean;
}

/**
 * Describes a text selection shared through awareness.
 */
export interface AwarenessSelection {
  /**
   * Identifies the selected element.
   */
  elementId: string;

  /**
   * Supplies the selection start offset.
   */
  from: number;

  /**
   * Supplies the selection end offset.
   */
  to: number;
}

/**
 * Describes awareness metadata shared by a peer.
 */
export interface AwarenessState {
  /**
   * Identifies the peer that owns this awareness state.
   */
  peerId: string;

  /**
   * Indicates whether the peer is typing.
   */
  typing?: boolean;

  /**
   * Identifies the focused element when available.
   */
  focus?: string | null;

  /**
   * Supplies the peer selection when available.
   */
  selection?: AwarenessSelection | null;

  /**
   * Carries additional awareness metadata.
   */
  [key: string]: unknown;
}

/**
 * Describes a peer's viewport — scroll position, zoom, and dimensions of the
 * tracked container — shared so peers can follow one another.
 *
 * Scroll coordinates are normalized to the `0`–`1` range (a fraction of the
 * scrollable area) so they stay consistent across different screen sizes.
 */
export interface ViewportState {
  /**
   * Identifies the peer that owns this viewport state.
   */
  peerId: string;

  /**
   * Reports the horizontal scroll position as a fraction of the scrollable
   * width, from `0` (fully left) to `1` (fully right). `0` when the tracked
   * element cannot scroll horizontally.
   */
  scrollX: number;

  /**
   * Reports the vertical scroll position as a fraction of the scrollable
   * height, from `0` (fully top) to `1` (fully bottom). `0` when the tracked
   * element cannot scroll vertically.
   */
  scrollY: number;

  /**
   * Reports the peer's zoom level, where `1` represents 100%. Zoom is carried
   * for the consuming app to apply, since how zoom is applied is app-specific.
   */
  zoom: number;

  /**
   * Reports the tracked element's viewport width in CSS pixels.
   */
  viewportWidth: number;

  /**
   * Reports the tracked element's viewport height in CSS pixels.
   */
  viewportHeight: number;

  /**
   * Identifies the peer's focused element as a CSS selector, or `null` when
   * none is reported.
   */
  focusedElement: string | null;
}

/**
 * Configures viewport tracking behavior.
 */
export interface ViewportOptions {
  /**
   * Throttles viewport broadcasts in milliseconds.
   */
  throttleMs?: number;
}

/**
 * Describes a single peer's laser-pointer beam — a transient position broadcast
 * only while that peer's pointer is active. `x`/`y` are normalized `0`–`1` of the
 * tracked container (resolution-independent, like cursor and viewport coordinates),
 * so each peer denormalizes them against its own container size.
 */
export interface PointerBeam {
  /**
   * Identifies the peer that owns the beam.
   */
  peerId: string;

  /**
   * Supplies the peer display name, resolved from the peer's presence.
   */
  name: string;

  /**
   * Supplies the peer color, resolved from the peer's presence.
   */
  color: string;

  /**
   * Reports the normalized X coordinate within the tracked container, from `0`
   * (left edge) to `1` (right edge).
   */
  x: number;

  /**
   * Reports the normalized Y coordinate within the tracked container, from `0`
   * (top edge) to `1` (bottom edge).
   */
  y: number;

  /**
   * Indicates whether the peer's pointer is currently broadcasting. An inactive
   * beam is dropped by peers (the laser disappears).
   */
  active: boolean;
}

/**
 * Configures pointer (laser pointer) tracking behavior.
 */
export interface PointerOptions {
  /**
   * Throttles pointer position broadcasts in milliseconds.
   */
  throttleMs?: number;
}

/**
 * Selects how the built-in pointer overlay draws each remote beam.
 *
 * - `'laser'` — a colored dot with a soft glow (the default).
 * - `'spotlight'` — a soft radial dim centered on the point.
 * - `'crosshair'` — thin horizontal and vertical cross lines through the point.
 * - `'dot'` — a plain colored dot.
 */
export type PointerStyle = 'laser' | 'spotlight' | 'crosshair' | 'dot';

/**
 * Configures the built-in DOM pointer overlay rendered by
 * {@link PointerEngine.render}.
 */
export interface PointerRenderOptions {
  /**
   * Selects the container element or selector the overlay is drawn over.
   * Defaults to the mounted element.
   */
  container?: string | HTMLElement;

  /**
   * Chooses how each remote beam is drawn. Defaults to `'laser'`.
   */
  style?: PointerStyle;

  /**
   * Sets the z-index applied to the overlay layer. Defaults to `9999`.
   */
  zIndex?: number;
}

/**
 * Describes the resolved state of a single advisory lock — who holds it (if
 * anyone) and when the claim was made and expires.
 *
 * Locks are EPHEMERAL (released on holder disconnect, TTL expiry, or explicit
 * release) and ADVISORY (a coordination convention, not enforced mutual
 * exclusion). Every peer resolves the holder independently and deterministically
 * so the result converges, but see {@link LockEngine} for the consistency model
 * and the brief races possible under simultaneous claims.
 */
export interface LockState {
  /**
   * Identifies the lock.
   */
  key: string;

  /**
   * Identifies the peer that currently holds the lock, or `null` when the lock
   * is free.
   */
  holder: Peer | null;

  /**
   * Records when the holding claim was made, in epoch milliseconds. `0` when the
   * lock is free.
   */
  acquiredAt: number;

  /**
   * Records when the holding claim self-expires, in epoch milliseconds, or
   * `null` when the claim has no TTL (and only releases explicitly or on
   * disconnect). `null` when the lock is free.
   */
  expiresAt: number | null;
}

/**
 * Configures a single {@link LockEngine.acquire} attempt.
 */
export interface LockAcquireOptions {
  /**
   * Auto-releases the lock this many milliseconds after it is acquired, even if
   * the holder never calls {@link LockEngine.release} (for example, after a
   * crash). Omit for a lock that only releases explicitly or on disconnect.
   */
  ttl?: number;

  /**
   * Waits up to this many milliseconds for the lock to become free before giving
   * up, re-attempting as holders release or expire. Omit to resolve promptly
   * against the current holder without waiting.
   */
  timeout?: number;
}

/**
 * Exposes presence operations for a room.
 *
 * @typeParam TPresence - The custom peer presence shape.
 */
export interface PresenceEngine<TPresence extends PresenceData = PresenceData> {
  /**
   * Partially updates the local presence payload. Merges into the existing value.
   *
   * @param data - The partial presence payload to merge into the local peer.
   * @returns Nothing.
   */
  update(this: void, data: Partial<TPresence>): void;

  /**
   * Replaces the local presence payload. Overwrites the existing value.
   *
   * @param data - The partial presence payload to publish for the local peer.
   * @returns Nothing.
   */
  replace(this: void, data: Partial<TPresence>): void;

  /**
   * Subscribes to peer presence changes.
   *
   * @param cb - The callback invoked with the full peer list.
   * @returns A function that removes the listener.
   */
  subscribe(cb: (peers: Peer<TPresence>[]) => void): Unsubscribe;

  /**
   * Looks up a peer by identifier.
   *
   * @param peerId - The peer identifier to resolve.
   * @returns The matching peer when present, otherwise `null`.
   */
  get(peerId: string): Peer<TPresence> | null;

  /**
   * Returns every known peer, including the local peer.
   *
   * @returns A snapshot of all known peers.
   */
  getAll(): Peer<TPresence>[];

  /**
   * Returns the local peer snapshot.
   *
   * @returns The local peer.
   */
  getSelf(): Peer<TPresence>;
}

/**
 * Exposes cursor operations for a room.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 */
export interface CursorEngine<TCursor extends CursorData = CursorData> {
  /**
   * Starts tracking pointer movement within an element.
   *
   * @param el - The element to observe for local cursor updates.
   * @returns Nothing.
   */
  mount(el: HTMLElement): void;

  /**
   * Stops tracking local cursor movement.
   *
   * @returns Nothing.
   */
  unmount(): void;

  /**
   * Renders remote cursors into the DOM.
   *
   * @param options - Optional cursor rendering overrides.
   * @returns Nothing.
   */
  render(options?: CursorRenderOptions): void;

  /**
   * Subscribes to cursor position updates.
   *
   * @param cb - The callback invoked with current cursor positions.
   * @returns A function that removes the listener.
   */
  subscribe(cb: (positions: CursorPosition<TCursor>[]) => void): Unsubscribe;

  /**
   * Returns the latest known cursor positions.
   *
   * @returns The current cursor position list.
   */
  getPositions(): CursorPosition<TCursor>[];

  /**
   * Updates the local cursor payload. Merges into the existing value.
   *
   * @param position - The partial cursor payload to publish.
   * @returns Nothing.
   */
  setPosition(position: Partial<CursorPosition<TCursor>>): void;
}

/**
 * Exposes shared-state operations for a room.
 *
 * @typeParam T - The shared state value type.
 */
export interface StateEngine<T> {
  /**
   * Reads the latest shared state value.
   *
   * @returns The current shared state value.
   */
  get(): T;

  /**
   * Replaces the shared state value. Overwrites the existing value.
   *
   * @param value - The next shared state value.
   * @returns Nothing.
   */
  set(value: T): void;

  /**
   * Partially updates a shared object state. Merges into the existing value.
   *
   * @param partial - The partial state value to merge.
   * @returns Nothing.
   */
  patch(partial: Partial<T>): void;

  /**
   * Subscribes to shared-state changes.
   *
   * @param cb - The callback invoked with the latest value and metadata.
   * @returns A function that removes the listener.
   */
  subscribe(cb: (value: T, meta: StateChangeMeta) => void): Unsubscribe;

  /**
   * Reverts the most recent shared-state change when possible.
   *
   * @returns Nothing.
   */
  undo(): void;

  /**
   * Restores the shared state to its initial value.
   *
   * @returns Nothing.
   */
  reset(): void;
}

/**
 * Exposes awareness operations for a room.
 */
export interface AwarenessEngine {
  /**
   * Merges arbitrary awareness metadata into the local peer. Merges into the existing value.
   *
   * @param value - The awareness fields to merge.
   * @returns Nothing.
   */
  set(value: Record<string, unknown>): void;

  /**
   * Updates the local typing state.
   *
   * @param isTyping - Whether the local peer is currently typing.
   * @returns Nothing.
   */
  setTyping(isTyping: boolean): void;

  /**
   * Updates the local focus target.
   *
   * @param elementId - The focused element identifier, or `null` to clear it.
   * @returns Nothing.
   */
  setFocus(elementId: string | null): void;

  /**
   * Updates the local text selection.
   *
   * @param selection - The active selection, or `null` to clear it.
   * @returns Nothing.
   */
  setSelection(selection: AwarenessSelection | null): void;

  /**
   * Subscribes to remote awareness updates.
   *
   * @param cb - The callback invoked with remote awareness snapshots.
   * @returns A function that removes the listener.
   */
  subscribe(cb: (peers: AwarenessState[]) => void): Unsubscribe;

  /**
   * Returns all remote awareness snapshots.
   *
   * @returns The current awareness snapshots.
   */
  getAll(): AwarenessState[];
}

/**
 * Reports the remote peers currently active on one field, keyed by an app-defined field id (a form
 * input, table cell, or record attribute). Used to render "who else is editing this" indicators.
 */
export interface FieldPresenceState {
  /**
   * The app-defined field identifier (e.g. `'user.email'` or `'row-42:status'`).
   */
  fieldId: string;

  /**
   * The remote peers currently on the field, resolved with live presence.
   */
  peers: Peer[];
}

/**
 * A field-oriented view of the awareness channel: which remote peers are active on which field
 * right now. `setActiveField` declares the local peer's field (e.g. on focus); the reads answer
 * "who else is here". Rides the awareness transport, so no relay change is needed. Purpose-built for
 * collaborative forms, tables, and admin records. See `docs/reference/engines-field-presence.md`.
 */
export interface FieldPresenceEngine {
  /**
   * Declares the field the local peer is active on, or `null` to clear it (e.g. on blur).
   *
   * @param fieldId - The active field id, or `null`.
   * @returns Nothing.
   */
  setActiveField(fieldId: string | null): void;

  /**
   * Returns the remote peers currently active on a field.
   *
   * @param fieldId - The field to query.
   * @returns The remote peers on the field (empty when none).
   */
  getFieldPeers(fieldId: string): Peer[];

  /**
   * Returns every field with at least one remote peer, ordered by field id.
   *
   * @returns The active fields.
   */
  getActiveFields(): FieldPresenceState[];

  /**
   * Subscribes to field-presence changes. Fires immediately with the current fields.
   *
   * @param callback - Invoked with the active fields on every change.
   * @returns A function that removes the listener.
   */
  subscribe(callback: (fields: FieldPresenceState[]) => void): Unsubscribe;
}

/**
 * Exposes viewport synchronization for a room. A viewport engine streams this
 * peer's scroll/zoom/dimensions and applies a followed peer's viewport to the
 * mounted container.
 */
export interface ViewportEngine {
  /**
   * Observes the element's scroll, zoom, and dimensions, and broadcasts them as
   * the local viewport while broadcasting is active. The engine mounts on a
   * scrollable container element (not `window`).
   *
   * @param element - The container element to observe.
   * @returns Nothing.
   */
  mount(element: HTMLElement): void;

  /**
   * Stops observing the element and applies pending teardown.
   *
   * @returns Nothing.
   */
  unmount(): void;

  /**
   * Starts streaming the local viewport to all peers.
   *
   * @returns Nothing.
   */
  broadcast(): void;

  /**
   * Stops streaming the local viewport.
   *
   * @returns Nothing.
   */
  stopBroadcast(): void;

  /**
   * Enters present mode: broadcasts the local viewport and signals peers to
   * follow it until {@link ViewportEngine.stopPresenting} is called.
   *
   * @returns Nothing.
   */
  present(): void;

  /**
   * Leaves present mode and releases peers that were following.
   *
   * @returns Nothing.
   */
  stopPresenting(): void;

  /**
   * Follows a specific peer's viewport, applying their scroll position to the
   * mounted element as their viewport changes. Zoom is exposed in state for the
   * app to apply.
   *
   * @param peerId - The peer whose viewport to follow.
   * @returns Nothing.
   */
  follow(peerId: string): void;

  /**
   * Stops following any peer and resumes independent scrolling.
   *
   * @returns Nothing.
   */
  unfollow(): void;

  /**
   * Subscribes to remote viewport updates.
   *
   * @param cb - The callback invoked with the current remote viewport states.
   * @returns A function that removes the listener.
   */
  subscribe(cb: (states: ViewportState[]) => void): Unsubscribe;

  /**
   * Returns all remote viewport states.
   *
   * @returns The current remote viewport states.
   */
  getAll(): ViewportState[];

  /**
   * Looks up a single peer's viewport state.
   *
   * @param peerId - The peer identifier to resolve.
   * @returns The matching viewport state, or `undefined` when none is known.
   */
  get(peerId: string): ViewportState | undefined;
}

/**
 * Exposes the laser-pointer primitive for a room. A pointer engine broadcasts
 * this peer's transient "beam" position while active and surfaces remote peers'
 * beams so they can be drawn. It is close to the cursor engine, but a beam is
 * only broadcast while {@link PointerEngine.activate} is in effect — deactivating
 * (or unmounting/disconnecting) makes the beam disappear for every peer.
 *
 * Like cursors and viewport, it rides the room's event channel and uses
 * normalized (`0`–`1`) coordinates, so no relay change is required.
 */
export interface PointerEngine {
  /**
   * Tracks `mousemove` on a container and broadcasts the normalized pointer
   * position while active. Mounting also targets the built-in renderer.
   *
   * @param element - The container element to track.
   * @returns Nothing.
   */
  mount(element: HTMLElement): void;

  /**
   * Stops tracking the element, broadcasts an inactive beam so peers drop it, and
   * tears down the built-in overlay.
   *
   * @returns Nothing.
   */
  unmount(): void;

  /**
   * Starts broadcasting this peer's pointer beam. While active, pointer movement
   * over the mounted element is broadcast to peers.
   *
   * @returns Nothing.
   */
  activate(): void;

  /**
   * Stops broadcasting and announces an inactive beam so peers drop it (the laser
   * disappears).
   *
   * @returns Nothing.
   */
  deactivate(): void;

  /**
   * Subscribes to remote pointer beams.
   *
   * @param cb - The callback invoked with the current remote beams.
   * @returns A function that removes the listener.
   */
  subscribe(cb: (beams: PointerBeam[]) => void): Unsubscribe;

  /**
   * Returns all remote pointer beams.
   *
   * @returns The current remote beams.
   */
  getAll(): PointerBeam[];

  /**
   * Renders a built-in, zero-config DOM overlay that draws every remote active
   * beam over the container, updating as beams change. This is a convenience
   * layer; apps that draw their own pointers can ignore it and use
   * {@link PointerEngine.subscribe} instead.
   *
   * @param options - The overlay container and style.
   * @returns A cleanup function that removes the overlay.
   */
  render(options?: PointerRenderOptions): Unsubscribe;
}

/**
 * Exposes a distributed advisory mutex over UI keys for a room. Use it to claim
 * exclusive ownership of an arbitrary key (an editable cell, a draggable block)
 * so peers can coordinate "only one editor at a time" interactions.
 *
 * Consistency model — there is NO central lock authority. Each peer broadcasts
 * its lock CLAIMS and RELEASES on the event channel and every peer resolves each
 * key's holder independently and deterministically: the earliest non-expired,
 * non-released claim wins, with the lower `peerId` breaking exact ties. Because
 * all peers apply the same rule to the same claims, they converge on the same
 * holder. Locks are ADVISORY (a convention — nothing prevents code that ignores
 * the engine from mutating the same resource) and EVENTUALLY CONSISTENT: during
 * the propagation window of two near-simultaneous claims a peer may briefly see
 * itself as holder before a conflicting earlier claim arrives, then converge.
 * {@link LockEngine.acquire} waits a short bounded window for conflicting claims
 * to surface before resolving to narrow that race, but cannot eliminate it in a
 * P2P/relay model. Treat the lock as coordination, not a correctness guarantee;
 * there are no deadlocks by design.
 */
export interface LockEngine {
  /**
   * Claims exclusive ownership of `key`. Broadcasts a claim, waits a short
   * bounded window for any conflicting earlier claim to surface, then resolves
   * to whether the local peer is the holder.
   *
   * With `options.timeout`, keeps re-attempting until the lock frees (a holder
   * releases or its TTL expires) or the timeout elapses. With `options.ttl`, the
   * claim self-expires after the TTL so a crashed holder cannot hold it forever.
   *
   * @param key - The lock key to claim.
   * @param options - Optional TTL and wait-timeout configuration.
   * @returns A promise resolving `true` when the local peer holds the lock,
   *   `false` when another peer holds it.
   */
  acquire(key: string, options?: LockAcquireOptions): Promise<boolean>;

  /**
   * Releases a lock held by the local peer. No-op when the local peer does not
   * hold `key`.
   *
   * @param key - The lock key to release.
   * @returns Nothing.
   */
  release(key: string): void;

  /**
   * Releases every lock currently held by the local peer.
   *
   * @returns Nothing.
   */
  releaseAll(): void;

  /**
   * Reports whether `key` is currently held by any peer (including the local
   * peer).
   *
   * @param key - The lock key to test.
   * @returns `true` when the key has a non-expired holder.
   */
  isLocked(key: string): boolean;

  /**
   * Returns the peer currently holding `key`, or `null` when the lock is free.
   *
   * @param key - The lock key to resolve.
   * @returns The holding peer, or `null`.
   */
  getHolder(key: string): Peer | null;

  /**
   * Returns the resolved state of every known lock that currently has a holder.
   *
   * @returns The current lock states.
   */
  getAll(): LockState[];

  /**
   * Subscribes to changes for a single lock key. Fires with the current state
   * whenever the resolved holder, claim time, or expiry for `key` changes.
   *
   * @param key - The lock key to observe.
   * @param callback - The callback invoked with the latest state for `key`.
   * @returns A function that removes the listener.
   */
  subscribe(key: string, callback: (state: LockState) => void): Unsubscribe;

  /**
   * Subscribes to changes across all locks. Fires with every held lock's state
   * whenever any lock changes.
   *
   * @param callback - The callback invoked with the latest lock states.
   * @returns A function that removes the listener.
   */
  subscribeAll(callback: (states: LockState[]) => void): Unsubscribe;
}

/**
 * Anchors a comment thread to the document it annotates. One of:
 *
 * - `{ elementId }` — pins the thread to an element.
 * - `{ x, y }` — pins the thread to a point in canvas/coordinate space.
 * - `{ from, to, elementId }` — pins the thread to a text-selection range
 *   within an element.
 */
export type CommentAnchor =
  | { elementId: string }
  | { x: number; y: number }
  | { from: number; to: number; elementId: string }
  | { recordId: string }
  | { recordId: string; fieldId: string }
  | { fieldId: string }
  | { nodeId: string };

/**
 * A single reply within a comment thread.
 */
export interface Comment {
  /**
   * Identifies the reply within its thread.
   */
  id: string;

  /**
   * The peer that authored the reply.
   */
  author: Peer;

  /**
   * The reply body.
   */
  text: string;

  /**
   * The epoch-millisecond timestamp when the reply was created.
   */
  createdAt: number;
}

/**
 * A collaborative comment thread: a root comment, its anchor, and any replies.
 * Threads are persistent collaborative state — they sync across peers and
 * survive late joins, unlike the ephemeral presence-style primitives.
 */
export interface CommentThread {
  /**
   * Identifies the thread within the room.
   */
  id: string;

  /**
   * Where the thread is anchored in the annotated document.
   */
  anchor: CommentAnchor;

  /**
   * The peer that opened the thread.
   */
  author: Peer;

  /**
   * The root comment body.
   */
  text: string;

  /**
   * The epoch-millisecond timestamp when the thread was created.
   */
  createdAt: number;

  /**
   * Whether the thread has been resolved.
   */
  resolved: boolean;

  /**
   * The replies appended to the thread, in creation order.
   */
  replies: Comment[];
}

/**
 * A single entry in the room activity feed.
 */
export interface ActivityEntry {
  /**
   * Identifies the entry within the room.
   */
  id: string;

  /**
   * The activity type — an app-defined label, e.g. `'comment:added'` or `'record:locked'`.
   */
  type: string;

  /**
   * The peer that produced the activity, carrying live presence.
   */
  actor: Peer;

  /**
   * An optional structured payload describing the activity.
   */
  data?: unknown;

  /**
   * The epoch-millisecond timestamp when the activity was recorded.
   */
  timestamp: number;
}

/**
 * Configures the {@link ActivityEngine}.
 */
export interface ActivityOptions {
  /**
   * The maximum number of entries retained in the feed (default `100`); the oldest are dropped
   * first once the cap is exceeded.
   */
  limit?: number;

  /**
   * Optional durable storage. When set, the feed is restored from it on startup and saved after
   * every change, so activity survives reconnects and reloads. See {@link ActivityStorageAdapter}.
   */
  storageAdapter?: ActivityStorageAdapter;
}

/**
 * A shared, bounded, newest-first feed of room activity. Every `record` is broadcast to peers and
 * entries are ordered by timestamp, so all peers converge on the same recent feed. See
 * `docs/reference/engines-activity.md`.
 */
export interface ActivityEngine {
  /**
   * Records an activity entry and broadcasts it to peers.
   *
   * @param type - The activity type label.
   * @param data - An optional structured payload.
   * @returns The recorded entry.
   */
  record(type: string, data?: unknown): ActivityEntry;

  /**
   * Returns the current feed, newest first.
   *
   * @returns The activity entries.
   */
  getEntries(): ActivityEntry[];

  /**
   * Subscribes to feed changes; fires immediately with the current feed, then on every change.
   *
   * @param callback - The callback invoked with the latest entries.
   * @returns A function that removes the listener.
   */
  subscribe(callback: (entries: ActivityEntry[]) => void): Unsubscribe;
}

/**
 * The lifecycle of an {@link AgentProposal}: awaiting a human decision, then accepted or declined.
 */
export type AgentProposalStatus = 'pending' | 'approved' | 'rejected';

/**
 * An action an AI agent proposes but does not apply itself — it waits for a human to approve or
 * reject it, so AI actions are inspectable before they commit. Synced to every peer.
 */
export interface AgentProposal {
  /**
   * Identifies the proposal within the room.
   */
  id: string;

  /**
   * The peer that proposed the action (an AI agent), carrying live presence.
   */
  proposer: Peer;

  /**
   * The proposed action type — an app-defined label, e.g. `'clear-canvas'` or `'set-field'`.
   */
  type: string;

  /**
   * An optional structured payload describing the action, e.g. `{ field, value }`.
   */
  payload?: unknown;

  /**
   * The current decision state.
   */
  status: AgentProposalStatus;

  /**
   * When the proposal was created (ms epoch).
   */
  timestamp: number;

  /**
   * The peer that approved or rejected it, once decided.
   */
  decidedBy?: Peer;
}

/**
 * Configures the agent-approval engine.
 */
export interface AgentApprovalOptions {
  /**
   * Gates who may approve or reject a proposal. Returns `true` to allow the local peer to decide.
   * Defaults to allowing everyone. This is a cooperative UI-level gate — the proposer re-checks
   * `decidedBy` before it applies an approved action, which is the real enforcement point.
   *
   * @param proposal - The proposal being decided.
   * @param self - The local peer attempting the decision.
   * @returns `true` when the local peer may decide.
   */
  canDecide?(proposal: AgentProposal, self: Peer): boolean;
}

/**
 * A room's agent-approval workflow: agents `propose` actions, humans `approve`/`reject` them, and
 * every peer sees the synced proposal list. The proposer watches for the decision and applies (or
 * rolls back) the action, so nothing an agent proposes commits without a human in the loop.
 */
export interface AgentApprovalEngine {
  /**
   * Proposes an action for approval and broadcasts it to peers as `pending`.
   *
   * @param input - The action type and optional payload.
   * @returns The created proposal.
   */
  propose(input: { type: string; payload?: unknown }): AgentProposal;

  /**
   * Approves a pending proposal (if permitted) and broadcasts the decision.
   *
   * @param id - The proposal id.
   */
  approve(id: string): void;

  /**
   * Rejects a pending proposal (if permitted) and broadcasts the decision.
   *
   * @param id - The proposal id.
   */
  reject(id: string): void;

  /**
   * Returns every proposal, newest first.
   *
   * @returns The proposals.
   */
  getProposals(): AgentProposal[];

  /**
   * Returns the proposals still awaiting a decision, newest first.
   *
   * @returns The pending proposals.
   */
  getPending(): AgentProposal[];

  /**
   * Subscribes to proposal changes; fires immediately with the current list, then on every change.
   *
   * @param callback - The callback invoked with the latest proposals.
   * @returns A function that removes the listener.
   */
  subscribe(callback: (proposals: AgentProposal[]) => void): Unsubscribe;
}

/**
 * Configures the comments engine.
 */
export interface CommentsOptions {
  /**
   * Selects the storage backend.
   *
   * - `'memory'` (default) — the synced, in-room collaborative structure.
   * - `'indexeddb'` — additionally persists threads to the browser so they
   *   reload on the next session.
   * - `'rest'` — additionally mirrors threads to a REST endpoint.
   */
  storage?: 'memory' | 'indexeddb' | 'rest';

  /**
   * The REST endpoint used when `storage` is `'rest'`. Threads are loaded from
   * it on init and mutations are POSTed back to it.
   */
  restEndpoint?: string;

  /**
   * A custom durable {@link CommentsStorageAdapter}. When set, threads are
   * restored from it on startup (into an otherwise-empty room) and saved after
   * every change, so comments survive reconnects and reloads. Use this with the
   * default `storage: 'memory'` to back comments with Postgres, SQLite, or any
   * store; see `docs/reference/comments-storage.md`.
   */
  storageAdapter?: CommentsStorageAdapter;
}

/**
 * Operates on a single comment thread resolved by id.
 */
export interface CommentThreadHandle {
  /**
   * Appends a reply authored by the local peer to the thread.
   *
   * @param text - The reply body.
   * @returns A promise resolving to the updated thread.
   */
  reply(text: string): Promise<CommentThread>;

  /**
   * Marks the thread resolved.
   *
   * @returns A promise resolving to the updated thread.
   */
  resolve(): Promise<CommentThread>;

  /**
   * Reopens a resolved thread.
   *
   * @returns A promise resolving to the updated thread.
   */
  reopen(): Promise<CommentThread>;
}

/**
 * Exposes collaborative comment threads for a room. Threads are synced
 * collaborative state, shared across peers over the room's existing CRDT
 * channel.
 */
export interface CommentsEngine {
  /**
   * Opens a new thread authored by the local peer at `anchor`. The thread id
   * and `createdAt` are generated.
   *
   * @param input - The thread anchor and root comment body.
   * @returns A promise resolving to the created thread.
   */
  add(input: { anchor: CommentAnchor; text: string }): Promise<CommentThread>;

  /**
   * Resolves a handle for operating on the thread with `id`. The handle
   * methods no-op against an unknown id until it surfaces, then resolve to the
   * latest thread.
   *
   * @param id - The thread id.
   * @returns A handle exposing `reply`, `resolve`, and `reopen`.
   */
  thread(id: string): CommentThreadHandle;

  /**
   * Returns every thread, oldest first.
   *
   * @returns The current threads.
   */
  getAll(): CommentThread[];

  /**
   * Returns the threads anchored to `elementId` (element or text-range
   * anchors).
   *
   * @param elementId - The element id to filter by.
   * @returns The matching threads.
   */
  getByElement(elementId: string): CommentThread[];

  /**
   * Returns the unresolved threads.
   *
   * @returns The open threads.
   */
  getOpen(): CommentThread[];

  /**
   * Subscribes to thread changes. Fires immediately with the current threads,
   * then on every local or remote mutation.
   *
   * @param callback - The callback invoked with the latest threads.
   * @returns A function that removes the listener.
   */
  subscribe(callback: (threads: CommentThread[]) => void): Unsubscribe;
}

/**
 * A single entry in the shared collaborative history timeline. Every peer's
 * {@link HistoryEngine.capture} and {@link HistoryEngine.transaction} appends
 * one of these to a timeline that converges across all peers, so the whole room
 * sees the same ordered activity log.
 */
export interface TimelineEntry {
  /**
   * Identifies the entry within the room.
   */
  id: string;

  /**
   * The id of the peer that produced the entry.
   */
  peerId: string;

  /**
   * The display name of the peer that produced the entry, resolved from
   * presence at capture time. Falls back to the peer id when no name is set.
   */
  peerName: string;

  /**
   * The action label supplied to `capture`/`transaction` (for example
   * `'draw'` or `'move-shape'`).
   */
  action: string;

  /**
   * The epoch-millisecond timestamp when the entry was captured.
   */
  timestamp: number;

  /**
   * An optional human-readable description of the entry. Defaults to the
   * `action` when no explicit description is provided.
   */
  description: string;
}

/**
 * Configures the collaborative history engine.
 */
export interface HistoryOptions {
  /**
   * Caps how many timeline entries are retained per peer (and bounds the local
   * undo stack). Older entries beyond the cap are trimmed. Defaults to `100`.
   */
  maxEntries?: number;

  /**
   * Debounces rapid captures: mutations applied within this many milliseconds
   * of the previous one are merged into a single undoable entry. Defaults to
   * `500`.
   */
  captureInterval?: number;
}

/**
 * Exposes collaborative undo/redo plus a shared activity timeline for a room.
 *
 * Undo/redo is **per-peer**: each peer only reverts and replays its own changes
 * to the shared CRDT document, conflict-free, so one peer's undo never destroys
 * another peer's concurrent work. The timeline, by contrast, is **shared**:
 * every peer's captures converge into one ordered log that the whole room
 * observes.
 *
 * Scope and limits (see the engine implementation for the full rationale):
 * undo/redo act on the local peer's mutations to the shared CRDT `Y.Doc` — the
 * data behind `useState({ strategy: 'crdt' })`. App-local React state and the
 * `'lww'` state strategy are NOT auto-reverted; reverting those is the app's
 * responsibility. A bare `capture()` records a timeline entry (metadata) and is
 * only undoable when it is paired with `transaction()` mutations.
 */
export interface HistoryEngine {
  /**
   * Records a timeline entry without wrapping any mutation. Use this to log an
   * action that the app applies itself; pair it with `transaction` when the
   * action should also be undoable.
   *
   * @param action - The action label for the entry.
   * @param payload - Optional metadata; a string is used as the entry
   *   description, otherwise the description defaults to `action`.
   * @returns Nothing.
   */
  capture(action: string, payload?: unknown): void;

  /**
   * Runs `fn`, capturing every shared-CRDT mutation it makes as a single
   * undoable timeline entry. The mutations are committed under the local peer's
   * tracked transaction origin so a later `undo()` reverts exactly this unit.
   *
   * @param name - The action label recorded on the timeline entry.
   * @param fn - The function whose mutations form one undoable unit.
   * @returns Nothing.
   */
  transaction(name: string, fn: () => void): void;

  /**
   * Undoes the local peer's most recent tracked transaction, reverting only
   * that peer's changes to the shared CRDT document.
   *
   * @returns A promise that resolves once the undo is applied.
   */
  undo(): Promise<void>;

  /**
   * Redoes the local peer's most recently undone transaction.
   *
   * @returns A promise that resolves once the redo is applied.
   */
  redo(): Promise<void>;

  /**
   * Reports whether the local peer has a tracked transaction available to undo.
   *
   * @returns `true` when {@link HistoryEngine.undo} would have an effect.
   */
  canUndo(): boolean;

  /**
   * Reports whether the local peer has an undone transaction available to redo.
   *
   * @returns `true` when {@link HistoryEngine.redo} would have an effect.
   */
  canRedo(): boolean;

  /**
   * Returns the full shared timeline of every peer's entries, oldest first.
   *
   * @returns The current timeline entries.
   */
  timeline(): TimelineEntry[];

  /**
   * Subscribes to timeline changes. Fires immediately with the current
   * timeline, then on every local or remote change (including undo/redo
   * affecting `canUndo`/`canRedo`).
   *
   * @param callback - The callback invoked with the latest timeline.
   * @returns A function that removes the listener.
   */
  subscribe(callback: (timeline: TimelineEntry[]) => void): Unsubscribe;
}

/**
 * The direction a recorded signal travelled relative to the local peer:
 * `inbound` was received from the transport, `outbound` was sent to it.
 */
export type RecordingDirection = 'inbound' | 'outbound';

/**
 * A single captured wire signal in a session recording.
 */
export interface RecordingFrame {
  /** Milliseconds elapsed from the start of the recording to this signal. */
  t: number;

  /** Whether the local peer received or sent this signal. */
  direction: RecordingDirection;

  /** The wire signal captured at the room's transport boundary. */
  signal: RoomTransportSignal;
}

/**
 * A serializable session recording: a timed log of one peer's room traffic.
 * This is the shape written to and read back from a `.roomful` file.
 */
export interface RoomfulRecording {
  /** The recording schema version (see `RECORDING_FORMAT_VERSION`). */
  version: 1;

  /** The room the signals were captured from. */
  roomId: string;

  /** The local peer that captured them. */
  peerId: string;

  /** Absolute epoch milliseconds when capture started. */
  startedAt: number;

  /** Span of the recording in milliseconds (the last frame's offset). */
  durationMs: number;

  /** Every captured frame, in capture order. */
  frames: RecordingFrame[];
}

/**
 * A reactive snapshot of the recorder, for UI bindings.
 */
export interface RecordingState {
  /** Whether capture is currently active. */
  isRecording: boolean;

  /** How many frames have been captured in the current take. */
  frameCount: number;

  /** The span of the current take in milliseconds. */
  durationMs: number;
}

/**
 * Configures the recording engine, including privacy controls.
 */
export interface RecordingOptions {
  /**
   * A privacy hook applied to every frame before it is stored, so sensitive data never enters the
   * recording. Return the frame (optionally with its `signal` masked in place) to keep it, or `null`
   * to drop it entirely. The frame's `signal` is a fresh clone, so mutating it is safe.
   *
   * @param frame - The candidate frame (with a cloned signal).
   * @returns The frame to store, or `null` to drop it.
   */
  redact?: (frame: RecordingFrame) => RecordingFrame | null;
}

/**
 * A single emission from a {@link ReplaySession}.
 */
export interface ReplayEvent {
  /**
   * The frame just reached, or `null` for a pure state change (playback just
   * started, or just finished/stopped).
   */
  frame: RecordingFrame | null;

  /** Whether playback is currently running. */
  isPlaying: boolean;

  /** The index of the next frame to emit (equals the frame count when done). */
  cursor: number;
}

/**
 * Drives a timed playback of a recording. Frames are re-emitted at their
 * original tempo; the session does not re-apply them to a room.
 */
export interface ReplaySession {
  /** Starts playback from the beginning on a virtual clock. */
  play(): void;

  /** Stops playback and releases the pending timer. */
  stop(): void;

  /**
   * Jumps to a frame index, for a scrubbable timeline. Pauses playback and re-emits every frame
   * from the start up to (but not including) `index`, so a listener that applies frames rebuilds the
   * state at that point. `index` is clamped to `[0, frameCount]`.
   *
   * @param index - The frame index to scrub to.
   */
  seek(index: number): void;

  /**
   * Subscribes to per-frame emissions and play/stop changes. Fires immediately
   * with the current state, then once per frame, then a final `null`-frame
   * event when playback ends.
   *
   * @param callback - The callback invoked for each replay event.
   * @returns A function that removes the listener.
   */
  subscribe(callback: (event: ReplayEvent) => void): Unsubscribe;
}

/**
 * Records a room's wire signals for later inspection and timed replay.
 *
 * A recording is **local**: it logs the signals this peer sends and receives,
 * never touching the shared document and never syncing to other peers. Capture
 * is gated by `start()`/`stop()`; replay re-emits the captured frames at their
 * original tempo without re-applying them to a room.
 */
export interface RecordingEngine {
  /** Begins capturing wire signals, discarding any previous take. */
  start(): void;

  /** Stops capturing. The captured frames remain available. */
  stop(): void;

  /** Returns the current recorder state (recording flag, frame count, span). */
  getState(): RecordingState;

  /** Returns a copy of the frames captured so far. */
  getFrames(): RecordingFrame[];

  /** Serializes the current take into a portable {@link RoomfulRecording}. */
  export(): RoomfulRecording;

  /**
   * Builds a timed playback session for a recording, or for the current take
   * when none is given.
   *
   * @param recording - The recording to replay; defaults to the current take.
   * @returns A playback session.
   */
  replay(recording?: RoomfulRecording): ReplaySession;

  /**
   * Subscribes to recorder state changes (start/stop and each captured frame).
   * Fires immediately with the current state.
   *
   * @param callback - The callback invoked with the latest state.
   * @returns A function that removes the listener.
   */
  subscribe(callback: (state: RecordingState) => void): Unsubscribe;

  /**
   * Ingests a wire signal from the room runtime. The room calls this at its
   * transport boundary; it is a no-op unless recording. Not for application use.
   *
   * @param direction - Whether the signal was received or sent.
   * @param signal - The wire signal captured at the boundary.
   * @returns Nothing.
   */
  ingest(direction: RecordingDirection, signal: RoomTransportSignal): void;
}

/**
 * Exposes custom event operations for a room.
 *
 * @typeParam TPresence - The custom peer presence shape.
 */
export interface EventEngine<TPresence extends PresenceData = PresenceData> {
  /**
   * Broadcasts a custom event to the room.
   *
   * @typeParam TPayload - The payload type for this event call.
   * @param name - The event channel name.
   * @param payload - The payload to send.
   * @returns Nothing.
   */
  emit<TPayload = unknown>(name: string, payload: TPayload): void;

  /**
   * Sends a custom event to a specific peer.
   *
   * @typeParam TPayload - The payload type for this event call.
   * @param peerId - The target peer identifier.
   * @param name - The event channel name.
   * @param payload - The payload to send.
   * @returns Nothing.
   */
  emitTo<TPayload = unknown>(peerId: string, name: string, payload: TPayload): void;

  /**
   * Subscribes to a custom event channel.
   *
   * @typeParam TPayload - The payload type expected from this channel.
   * @param name - The event channel name.
   * @param cb - The callback invoked with the payload and sending peer.
   * @returns A function that removes the listener.
   */
  on<TPayload = unknown>(
    name: string,
    cb: (payload: TPayload, from: Peer<TPresence>) => void,
  ): Unsubscribe;

  /**
   * Removes a custom event listener.
   *
   * @typeParam TPayload - The payload type expected from this channel.
   * @param name - The event channel name.
   * @param cb - The callback to remove.
   * @returns Nothing.
   */
  off<TPayload = unknown>(
    name: string,
    cb: (payload: TPayload, from: Peer<TPresence>) => void,
  ): void;
}

/**
 * Exposes the public room API.
 *
 * @typeParam TPresence - The custom peer presence shape.
 */
export interface Room<TPresence extends PresenceData = PresenceData> {
  /**
   * Identifies the room.
   */
  readonly id: string;

  /**
   * Identifies the local peer.
   */
  readonly peerId: string;

  /**
   * Reports the current room status.
   */
  readonly status: RoomStatus;

  /**
   * Exposes the latest known peer list.
   */
  readonly peers: Peer<TPresence>[];

  /**
   * Reports the current peer count.
   */
  readonly peerCount: number;

  /**
   * Connects the room to its transport.
   *
   * @returns A promise that resolves when connection startup completes.
   */
  connect(): Promise<void>;

  /**
   * Disconnects the room from its transport.
   *
   * @returns A promise that resolves when disconnect teardown completes.
   */
  disconnect(): Promise<void>;

  /**
   * Produces a diagnostics snapshot for the room.
   *
   * @returns A promise that resolves to the current diagnostics snapshot.
   */
  getDiagnostics(): Promise<RoomDiagnostics>;

  /**
   * Accesses the presence engine for this room.
   *
   * @returns The presence engine.
   */
  usePresence(): PresenceEngine<TPresence>;

  /**
   * Accesses the cursor engine for this room.
   *
   * @typeParam TCursor - The custom cursor payload shape.
   * @param options - Optional cursor tracking configuration.
   * @returns The cursor engine.
   */
  useCursors<TCursor extends CursorData = CursorData>(
    options?: CursorOptions,
  ): CursorEngine<TCursor>;

  /**
   * Accesses the shared-state engine for this room.
   *
   * @typeParam T - The shared state value type.
   * @param options - The shared-state configuration.
   * @returns The state engine.
   */
  useState<T>(options: StateOptions<T>): StateEngine<T>;

  /**
   * Accesses the awareness engine for this room.
   *
   * @returns The awareness engine.
   */
  useAwareness(): AwarenessEngine;

  /**
   * Accesses the viewport synchronization engine for this room.
   *
   * @param options - Optional viewport tracking configuration.
   * @returns The viewport engine.
   */
  useViewport(options?: ViewportOptions): ViewportEngine;

  /**
   * Accesses the laser-pointer engine for this room.
   *
   * @param options - Optional pointer tracking configuration.
   * @returns The pointer engine.
   */
  usePointer(options?: PointerOptions): PointerEngine;

  /**
   * Accesses the distributed advisory lock engine for this room.
   *
   * @returns The lock engine.
   */
  useLocks(): LockEngine;

  /**
   * Accesses the collaborative comments engine for this room.
   *
   * @param options - Optional storage backend configuration.
   * @returns The comments engine.
   */
  useComments(options?: CommentsOptions): CommentsEngine;

  /**
   * Accesses the room activity feed engine.
   *
   * @param options - Optional feed configuration (retention limit).
   * @returns The activity engine.
   */
  useActivity(options?: ActivityOptions): ActivityEngine;

  /**
   * Accesses the agent-approval engine: the human-in-the-loop workflow where agents propose actions
   * and humans approve or reject them.
   *
   * @param options - Optional configuration (permission hook).
   * @returns The agent-approval engine.
   */
  useAgentApprovals(options?: AgentApprovalOptions): AgentApprovalEngine;

  /**
   * Accesses the field-presence engine: which remote peers are active on which field.
   *
   * @returns The field-presence engine.
   */
  useFieldPresence(): FieldPresenceEngine;

  /**
   * Accesses the collaborative history (undo/redo plus shared timeline) engine
   * for this room.
   *
   * @param options - Optional history configuration.
   * @returns The history engine.
   */
  useHistory(options?: HistoryOptions): HistoryEngine;

  /**
   * Accesses the session-recording engine for this room: capture the room's
   * wire signals, then export or replay them. Local to this peer.
   *
   * @param options - Optional configuration, including a `redact` privacy hook.
   * @returns The recording engine.
   */
  useRecording(options?: RecordingOptions): RecordingEngine;

  /**
   * Applies a previously recorded wire signal to this room's engines, as if it
   * had just arrived — reconstructing presence, cursors, and shared state from
   * a {@link RecordingFrame}'s `signal`. Feed a recording's frames in order
   * (e.g. from a {@link ReplaySession}) into a throwaway offline room to replay
   * a session visually. Not for live use.
   *
   * @param signal - The recorded wire signal to apply.
   * @returns Nothing.
   */
  applyReplaySignal(signal: RoomTransportSignal): void;

  /**
   * Accesses the custom event engine for this room.
   *
   * @param options - Optional custom event behavior overrides.
   * @returns The event engine.
   */
  useEvents(options?: EventOptions): EventEngine<TPresence>;

  /**
   * Exposes the underlying Yjs document for CRDT integrations.
   *
   * @returns The shared Yjs document.
   */
  getYDoc(): YDoc;

  /**
   * Exposes the underlying Yjs provider for CRDT integrations.
   *
   * @returns The Yjs provider.
   */
  getYProvider(): RoomfulYjsProvider;

  /**
   * Subscribes to a built-in room lifecycle event.
   *
   * @typeParam TEvent - The built-in event name to subscribe to.
   * @param event - The event name to observe.
   * @param cb - The callback invoked with the matching payload.
   * @returns A function that removes the listener.
   */
  on<TEvent extends RoomEventName>(
    event: TEvent,
    cb: RoomEventHandler<TPresence, TEvent>,
  ): Unsubscribe;

  /**
   * Removes a built-in room lifecycle listener.
   *
   * @typeParam TEvent - The built-in event name being removed.
   * @param event - The event name to unsubscribe from.
   * @param cb - The callback to remove.
   * @returns Nothing.
   */
  off<TEvent extends RoomEventName>(event: TEvent, cb: RoomEventHandler<TPresence, TEvent>): void;
}
