import type { Awareness as YjsAwareness } from 'y-protocols/awareness';
import type { Doc as YDoc } from 'yjs';

import type { FlockError, FlockErrorCode } from './flock-error';
import type { TransportKind } from './transports/transport';

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
 */
export type TransportMode = 'auto' | 'webrtc' | 'websocket' | 'broadcast';

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
 * Re-exports the public `FlockError` class type.
 */
export type { FlockError, FlockErrorCode };

/**
 * Unsubscribes a previously registered listener.
 *
 * @returns Nothing.
 */
export type Unsubscribe = () => void;

/**
 * Represents the connection state of the Yjs provider.
 */
export type FlockYjsProviderStatus = 'connected' | 'disconnected';

/**
 * Maps Yjs provider event names to payloads.
 */
export interface FlockYjsProviderEventMap {
  /**
   * Fires when the provider connection status changes.
   */
  status: {
    /**
     * Reports the new provider status.
     */
    status: FlockYjsProviderStatus;
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
export type FlockYjsProviderEventName = keyof FlockYjsProviderEventMap;

/**
 * Handles a Yjs provider event.
 *
 * @typeParam TEvent - The event name being handled.
 * @param payload - The payload for the event.
 * @returns Nothing.
 */
export type FlockYjsProviderEventHandler<TEvent extends FlockYjsProviderEventName> = (
  payload: FlockYjsProviderEventMap[TEvent],
) => void;

/**
 * Exposes the Yjs document and provider used by CRDT state synchronization.
 */
export interface FlockYjsProvider {
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
  readonly status: FlockYjsProviderStatus;

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
  on<TEvent extends FlockYjsProviderEventName>(
    event: TEvent,
    cb: FlockYjsProviderEventHandler<TEvent>,
  ): Unsubscribe;

  /**
   * Removes a provider lifecycle listener.
   *
   * @typeParam TEvent - The provider event name being removed.
   * @param event - The provider event name to unsubscribe from.
   * @param cb - The callback to remove.
   * @returns Nothing.
   */
  off<TEvent extends FlockYjsProviderEventName>(
    event: TEvent,
    cb: FlockYjsProviderEventHandler<TEvent>,
  ): void;
}

/**
 * Names the built-in room lifecycle events.
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
  error: FlockError;

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
   * Chooses the cursor marker style.
   */
  style?: 'default' | string;

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

  /**
   * Marks emitted events as requiring reliable delivery when supported.
   */
  reliable?: boolean;
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
 * Exposes presence operations for a room.
 *
 * @typeParam TPresence - The custom peer presence shape.
 */
export interface PresenceEngine<TPresence extends PresenceData = PresenceData> {
  /**
   * Partially updates the local presence payload.
   *
   * @param data - The partial presence payload to merge into the local peer.
   * @returns Nothing.
   */
  update(this: void, data: Partial<TPresence>): void;

  /**
   * Replaces the local presence payload.
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
   * Updates the local cursor payload.
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
   * Replaces the shared state value.
   *
   * @param value - The next shared state value.
   * @returns Nothing.
   */
  set(value: T): void;

  /**
   * Partially updates a shared object state.
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
   * Merges arbitrary awareness metadata into the local peer.
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
  getYProvider(): FlockYjsProvider;

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
