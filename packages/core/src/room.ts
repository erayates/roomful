import {
  DEVTOOLS_BRIDGE_VERSION,
  DEVTOOLS_MAX_EVENT_LOG_ENTRIES,
  type DevtoolsCommandResult,
  type DevtoolsEventDirection,
  type DevtoolsEventLogEntry,
  type DevtoolsPeerSnapshot,
  type DevtoolsRoomSnapshot,
  type DevtoolsRoomSummary,
  type DevtoolsSerializedRecord,
  type DevtoolsSerializedValue,
  type DevtoolsStateSnapshot,
  diffSerializedState,
  serializeDevtoolsValue,
} from '@flockjs/devtools';

import {
  createEncryptionHandshake,
  decryptWirePayload,
  type EncryptionEnvelopeHeader,
  encryptWirePayload,
  isEncryptionEnabled,
  type ResolvedRoomEncryption,
  resolveRoomEncryption,
} from './encryption';
import { createAwarenessEngine } from './engines/awareness';
import { createCursorEngine } from './engines/cursors';
import { createEventEngine } from './engines/events';
import { createPresenceEngine } from './engines/presence';
import { createStateEngine } from './engines/state';
import { createCrdtStateEngine as createCrdtStateEngineRuntime } from './engines/state.crdt';
import { TypedEventEmitter } from './event-emitter';
import { createFlockError, FlockError } from './flock-error';
import { registerRoomDevtoolsAdapter } from './internal/devtools-bridge';
import { createRuntimePeerId, getWindowEventTarget, type WindowEventTarget } from './internal/env';
import { isObject, readString } from './internal/guards';
import { createStructuredLogger, type StructuredLogger } from './internal/logger';
import { normalizeMaxPeers } from './internal/max-peers';
import {
  appendOfflineQueueEntry,
  applyOfflineStateMutation,
  countQueuedStateMutations,
  createOfflineStateMutation,
  hasQueuedStateMutations,
  type OfflineQueueEntry,
  projectOfflineStateSnapshot,
} from './internal/offline-queue';
import { PeerRegistry } from './internal/peer-registry';
import {
  computeReconnectDelay,
  delayWithAbort,
  type ResolvedReconnectOptions,
  resolveReconnectOptions,
} from './internal/reconnect';
import {
  cloneStateSnapshot,
  cloneStateValue,
  compareStateSnapshots,
  createInitialStateSnapshot,
  type StateSnapshot,
} from './internal/state';
import { readPersistedLwwState, writePersistedLwwState } from './internal/state.persistence';
import { coerceTypedPeer } from './internal/typed-peer';
import {
  decodeMessagePack,
  encodeMessagePack,
  type ProtocolSerializationResult,
} from './protocol/messagepack';
import { createPollingTransportAdapter } from './transports/polling';
import {
  selectTransportAdapter,
  shouldSelectWebSocketTransport,
} from './transports/select-transport';
import type {
  RoomTransportSignal,
  TransportAdapter,
  TransportKind,
  TransportSignal,
} from './transports/transport';
import {
  getTransportProtocolCapabilities,
  normalizeTransportSignal,
  parseTransportSignal,
} from './transports/transport.protocol';
import { isWebSocketPollingFallbackEligibleError } from './transports/websocket';
import type {
  AwarenessEngine,
  AwarenessState,
  CursorData,
  CursorEngine,
  CursorOptions,
  CursorPosition,
  EventEngine,
  EventOptions,
  FlockYjsProvider,
  Peer,
  PresenceData,
  PresenceEngine,
  Room,
  RoomDiagnostics,
  RoomEventHandler,
  RoomEventMap,
  RoomEventName,
  RoomOptions,
  RoomStatus,
  StateChangeMeta,
  StateEngine,
  StateOptions,
  Unsubscribe,
} from './types';
import { RoomYjsController } from './yjs/controller';

const LOCKED_PRESENCE_KEYS = new Set(['id', 'joinedAt', 'lastSeen']);
const PRESENCE_HEARTBEAT_MS = 30_000;
const OFFLINE_QUEUE_REPLAY_SETTLE_MS = 10;

interface ConnectContext {
  isReconnectAttempt: boolean;
}

interface RoomInternalOptions {
  hideFromDevtools?: boolean;
}

type PeerEventCallback<TPresence extends PresenceData> = (peers: Peer<TPresence>[]) => void;
type CursorCallback = (positions: CursorPosition[]) => void;
type StateSnapshotCallback = (snapshot: StateSnapshot) => void;
type AwarenessCallback = (peers: AwarenessState[]) => void;
type InternalEventCallback<TPresence extends PresenceData> = (
  payload: unknown,
  from: Peer<TPresence>,
) => void;

interface DevtoolsStateTracker {
  readonly strategy: 'lww' | 'crdt';
  readonly unsubscribe: Unsubscribe;
}

function isWebSocketPollingFallbackEnabled<TPresence extends PresenceData>(
  options: RoomOptions<TPresence>,
): boolean {
  return options.websocket?.fallbackTransport === 'polling';
}

function isFlockError(value: unknown): value is FlockError {
  return value instanceof FlockError;
}

function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === 'AbortError';
}

function toTransportError(error: unknown): FlockError {
  if (isFlockError(error)) {
    return error;
  }

  return createFlockError(
    'NETWORK_ERROR',
    error instanceof Error ? error.message : 'Unknown transport connection error.',
    false,
    error,
  );
}

function createReconnectExhaustedError(
  attempts: number,
  reason: string | null,
  lastError: unknown,
): FlockError {
  return createFlockError(
    'NETWORK_ERROR',
    `Reconnect attempts exhausted after ${attempts} attempt${attempts === 1 ? '' : 's'}.`,
    true,
    {
      source: 'room-reconnect',
      kind: 'max-attempts-exhausted',
      attempts,
      ...(reason ? { reason } : {}),
      ...(lastError !== undefined ? { lastError } : {}),
    },
  );
}

function sanitizePresencePatch<TPresence extends PresenceData>(
  patch: Partial<TPresence>,
): Partial<TPresence> {
  const sanitized: Partial<TPresence> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (LOCKED_PRESENCE_KEYS.has(key)) {
      continue;
    }

    Reflect.set(sanitized, key, value);
  }

  return sanitized;
}

function isInternalTransportSignal(signal: TransportSignal): boolean {
  return signal.type === 'transport:error' || signal.type === 'transport:disconnected';
}

function readTypedStateStoredValue<T>(value: unknown): T {
  // The room exposes a singleton shared state engine, so the first useState<T>() call
  // establishes the runtime value shape for subsequent reads through that engine.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return cloneStateValue(value as T);
}

function readTypedStateValue<T>(snapshot: StateSnapshot): T {
  return readTypedStateStoredValue<T>(snapshot.value);
}

function readTypedStateEngine<T>(stateEngine: unknown): StateEngine<T> {
  // The room caches one state engine instance, and the first useState<T>() call defines
  // the runtime shape for subsequent callers in that room.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return stateEngine as StateEngine<T>;
}

function readTypedCursorEngine<TCursor extends CursorData>(
  cursorEngine: unknown,
): CursorEngine<TCursor> {
  // The room exposes a singleton cursor engine, so callers choose the typed view they expect
  // over the shared runtime cursor payload shape for that room.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return cursorEngine as CursorEngine<TCursor>;
}

function computeUtf8ByteLength(value: string): number | null {
  if (typeof TextEncoder !== 'function') {
    return null;
  }

  return new TextEncoder().encode(value).byteLength;
}

function computeSerializedStateSizeBytes(value: unknown): number | null {
  let serialized: string | undefined;

  try {
    serialized = JSON.stringify(value);
  } catch {
    return null;
  }

  if (serialized === undefined) {
    return null;
  }

  return computeUtf8ByteLength(serialized);
}

function isBootstrapSignal(
  signal: RoomTransportSignal,
): signal is Extract<RoomTransportSignal, { type: 'hello' | 'welcome' }> {
  return signal.type === 'hello' || signal.type === 'welcome';
}

function isPlaintextEncryptedRoomControlSignal(
  signal: RoomTransportSignal,
): signal is Extract<RoomTransportSignal, { type: 'hello' | 'welcome' | 'leave' }> {
  return signal.type === 'hello' || signal.type === 'welcome' || signal.type === 'leave';
}

function normalizeTransportSerializationResult(
  result: ProtocolSerializationResult<Uint8Array>,
): Uint8Array {
  if (!result.ok) {
    throw createFlockError('ENCRYPTION_ERROR', result.error, false, {
      source: 'room-encryption',
      kind: 'serialization-failed',
    });
  }

  return result.value;
}

function hasMatchingEncryptedSignalHeaders(
  outerSignal: Extract<RoomTransportSignal, { type: 'encrypted' }>,
  innerSignal: RoomTransportSignal,
): boolean {
  return (
    outerSignal.roomId === innerSignal.roomId &&
    outerSignal.fromPeerId === innerSignal.fromPeerId &&
    (outerSignal.toPeerId ?? null) === (innerSignal.toPeerId ?? null) &&
    outerSignal.timestamp === innerSignal.timestamp
  );
}

function isSerializedRecord(value: DevtoolsSerializedValue): value is DevtoolsSerializedRecord {
  return isObject(value) && !Array.isArray(value);
}

function serializeRecord(value: unknown): DevtoolsSerializedRecord {
  const serialized = serializeDevtoolsValue(value);
  if (isSerializedRecord(serialized)) {
    return serialized;
  }

  return {
    value: serialized,
  };
}

function appendDevtoolsEventLog(
  entries: DevtoolsEventLogEntry[],
  nextEntry: DevtoolsEventLogEntry,
): DevtoolsEventLogEntry[] {
  if (entries.length < DEVTOOLS_MAX_EVENT_LOG_ENTRIES) {
    return [...entries, nextEntry];
  }

  return [...entries.slice(entries.length - DEVTOOLS_MAX_EVENT_LOG_ENTRIES + 1), nextEntry];
}

function appendDevtoolsError(errors: string[], message: string): string[] {
  if (errors.length < 20) {
    return [...errors, message];
  }

  return [...errors.slice(errors.length - 19), message];
}

export class RoomImpl<TPresence extends PresenceData = PresenceData> implements Room<TPresence> {
  public readonly id: string;

  public readonly peerId: string;

  private readonly instanceId: string;

  private readonly options: RoomOptions<TPresence>;

  private readonly internalOptions: RoomInternalOptions;

  private readonly logger: StructuredLogger;

  private readonly maxPeers: number | undefined;

  private currentStatus: RoomStatus = 'idle';

  private readonly roomEventEmitter = new TypedEventEmitter<RoomEventMap<TPresence>>();

  private readonly peerRegistry: PeerRegistry<TPresence>;

  private readonly reconnectOptions: ResolvedReconnectOptions | null;

  private transport: TransportAdapter | null = null;

  private transportUnsubscribe: Unsubscribe | null = null;

  private pendingTransportUnsubscribe: Unsubscribe | null = null;

  private connectionPromise: Promise<void> | null = null;

  private reconnectPromise: Promise<void> | null = null;

  private inboundSignalQueue: Promise<void> = Promise.resolve();

  private outboundSignalQueue: Promise<void> = Promise.resolve();

  private reconnectController: AbortController | null = null;

  private hasConnectedBefore = false;

  private reconnectAttempt = 0;

  private lastDisconnectReason: string | null = null;

  private websocketFallbackTransportPreference: 'polling' | null = null;

  private unloadHandlersRegistered = false;

  private unloadEventTarget: WindowEventTarget | null = null;

  private presenceHeartbeat: ReturnType<typeof globalThis.setInterval> | null = null;

  private readonly onBeforeUnload = (): void => {
    this.handleWindowUnload();
  };

  private readonly onPageHide = (): void => {
    this.handleWindowUnload();
  };

  private readonly peerSubscribers = new Set<PeerEventCallback<TPresence>>();

  private readonly cursorPositions = new Map<string, CursorPosition>();

  private readonly cursorSubscribers = new Set<CursorCallback>();

  private readonly stateSnapshotSubscribers = new Set<StateSnapshotCallback>();

  private readonly awarenessByPeer = new Map<string, AwarenessState>();

  private readonly awarenessSubscribers = new Set<AwarenessCallback>();

  private readonly customEventHandlers = new Map<string, Set<InternalEventCallback<TPresence>>>();

  private presenceEngineInstance: PresenceEngine<TPresence> | null = null;

  private cursorEngineInstance: CursorEngine | null = null;

  private stateEngineInstance: unknown = null;

  private awarenessEngineInstance: AwarenessEngine | null = null;

  private yjsController: RoomYjsController<TPresence> | null = null;

  private stateSnapshot: StateSnapshot | null = null;

  private syncedStateSnapshot: StateSnapshot | null = null;

  private stateConfigured = false;

  private stateStrategy: 'lww' | 'crdt' | null = null;

  private statePersistenceEnabled = false;

  private stateInitialValue: unknown = undefined;

  private offlineQueue: OfflineQueueEntry[] = [];

  private offlineReplayTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  private offlineReplayInProgress = false;

  private offlineReplayRequested = false;

  private offlineWindowActive = false;

  private encryptionContext: ResolvedRoomEncryption | null = null;

  private encryptionContextPromise: Promise<ResolvedRoomEncryption | null> | null = null;

  private readonly incompatibleEncryptionPeers = new Set<string>();

  private readonly decryptionErrorPeers = new Set<string>();

  private connectStartedAt: number | null = null;

  private latestConnectDurationMs: number | null = null;

  private customEventMessagesSent = 0;

  private customEventMessagesReceived = 0;

  private customEventBroadcastsSent = 0;

  private customEventDirectSends = 0;

  private devtoolsStateTracker: DevtoolsStateTracker | null = null;

  private devtoolsStateValue: DevtoolsSerializedValue | null = null;

  private devtoolsStateDiff: DevtoolsStateSnapshot['diff'] = [];

  private devtoolsStateMeta: StateChangeMeta | null = null;

  private devtoolsEventLog: DevtoolsEventLogEntry[] = [];

  private devtoolsErrors: string[] = [];

  private devtoolsUnregister: Unsubscribe | null = null;

  private activeTransportKind: TransportKind | null = null;

  private simulatedPeerRoom: RoomImpl<TPresence> | null = null;

  public constructor(
    roomId: string,
    options: RoomOptions<TPresence> = {},
    internalOptions: RoomInternalOptions = {},
  ) {
    this.id = roomId;
    this.options = options;
    this.internalOptions = internalOptions;
    this.logger = createStructuredLogger({
      roomId,
      debug: options.debug,
    });
    this.maxPeers = normalizeMaxPeers(options.maxPeers);
    this.reconnectOptions = resolveReconnectOptions(options.reconnect);
    this.peerId = createRuntimePeerId();
    this.instanceId = `${roomId}::${this.peerId}`;

    const now = Date.now();
    const initialPresence = sanitizePresencePatch(options.presence ?? {});

    const initialSelfPeer: Peer<TPresence> = {
      id: this.peerId,
      joinedAt: now,
      lastSeen: now,
      ...initialPresence,
    };

    this.peerRegistry = new PeerRegistry(initialSelfPeer, {
      onPeerJoin: (peer) => {
        this.handlePeerRegistryJoin(peer);
      },
      onPeerUpdate: (peer) => {
        this.handlePeerRegistryUpdate(peer);
      },
      onPeerLeave: (peer) => {
        this.handlePeerRegistryLeave(peer);
      },
      onSnapshotChange: () => {
        this.notifyPeerSubscribers();
      },
    });

    this.awarenessByPeer.set(this.peerId, { peerId: this.peerId });

    this.ensureDevtoolsAdapterRegistered();
  }

  private get selfPeer(): Peer<TPresence> {
    return this.peerRegistry.getSelf();
  }

  private get encryptionEnabled(): boolean {
    return isEncryptionEnabled(this.options.encryption);
  }

  private getQueuedStateMutationCount(): number {
    return countQueuedStateMutations(this.offlineQueue);
  }

  private getStateSyncMeta(): Pick<StateChangeMeta, 'pending' | 'queuedMutationCount'> {
    const queuedMutationCount = this.getQueuedStateMutationCount();
    return {
      pending: queuedMutationCount > 0,
      queuedMutationCount,
    };
  }

  private shouldQueueOfflineWork(): boolean {
    return (
      (!this.transport && this.hasConnectedBefore) ||
      this.offlineQueue.length > 0 ||
      this.offlineReplayTimer !== null ||
      this.offlineReplayInProgress
    );
  }

  private getStateSizeBytes(): number | null {
    if (this.stateSnapshot) {
      return computeSerializedStateSizeBytes(this.stateSnapshot.value);
    }

    if (this.stateStrategy === 'crdt' && this.stateEngineInstance) {
      return computeSerializedStateSizeBytes(
        readTypedStateEngine<unknown>(this.stateEngineInstance).get(),
      );
    }

    return null;
  }

  private getRegisteredEventNames(): string[] {
    return Array.from(this.customEventHandlers.keys()).sort();
  }

  private get hasSimulatedPeer(): boolean {
    return this.simulatedPeerRoom !== null;
  }

  private ensureDevtoolsAdapterRegistered(): void {
    if (this.internalOptions.hideFromDevtools || this.devtoolsUnregister) {
      return;
    }

    this.devtoolsUnregister = registerRoomDevtoolsAdapter({
      disconnectSimulatedPeer: () => {
        return this.disconnectSimulatedPeer();
      },
      getSnapshot: () => {
        return this.getDevtoolsSnapshot();
      },
      getSummary: () => {
        return this.getDevtoolsSummary();
      },
      injectSimulatedPeer: () => {
        return this.injectSimulatedPeer();
      },
      instanceId: this.instanceId,
    });
  }

  private unregisterDevtoolsAdapter(): void {
    this.devtoolsUnregister?.();
    this.devtoolsUnregister = null;
  }

  private getDevtoolsSummary(): DevtoolsRoomSummary {
    return {
      hasSimulatedPeer: this.hasSimulatedPeer,
      hasState: this.stateStrategy !== null,
      instanceId: this.instanceId,
      peerCount: this.peerCount,
      peerId: this.peerId,
      roomId: this.id,
      status: this.status,
      transport: this.activeTransportKind,
    };
  }

  private getDevtoolsSnapshot(): DevtoolsRoomSnapshot {
    return {
      ...this.getDevtoolsSummary(),
      bridgeVersion: DEVTOOLS_BRIDGE_VERSION,
      errors: [...this.devtoolsErrors],
      events: [...this.devtoolsEventLog],
      peers: this.getDevtoolsPeers(),
      state: this.getDevtoolsStateSnapshot(),
    };
  }

  private getDevtoolsPeers(): DevtoolsPeerSnapshot[] {
    return this.getSelfAndPeersSnapshot().map((peer) => {
      return {
        id: peer.id,
        isSelf: peer.id === this.peerId,
        isSimulated: peer.id !== this.peerId && Reflect.get(peer, 'simulated') === true,
        joinedAt: peer.joinedAt,
        lastSeen: peer.lastSeen,
        presence: serializeRecord(peer),
      };
    });
  }

  private getDevtoolsStateSnapshot(): DevtoolsStateSnapshot {
    return {
      available: this.stateStrategy !== null && this.devtoolsStateValue !== null,
      diff: [...this.devtoolsStateDiff],
      lastChangedBy: this.devtoolsStateMeta?.changedBy ?? null,
      lastUpdatedAt: this.devtoolsStateMeta?.timestamp ?? null,
      pending: this.devtoolsStateMeta?.pending ?? false,
      queuedMutationCount: this.devtoolsStateMeta?.queuedMutationCount ?? 0,
      reason: this.devtoolsStateMeta?.reason ?? null,
      strategy: this.stateStrategy,
      value: this.devtoolsStateValue,
    };
  }

  private recordDevtoolsEvent(
    direction: DevtoolsEventDirection,
    name: string,
    payload: unknown,
    fromPeer: Peer<TPresence> | null,
    toPeerId?: string,
  ): void {
    const timestamp = Date.now();
    const fromPeerId = direction === 'outgoing' ? this.peerId : fromPeer ? fromPeer.id : null;
    const sender =
      direction === 'outgoing'
        ? serializeRecord(this.selfPeer)
        : fromPeer
          ? serializeRecord(fromPeer)
          : null;

    this.devtoolsEventLog = appendDevtoolsEventLog(this.devtoolsEventLog, {
      direction,
      fromPeerId,
      id: `${timestamp}:${direction}:${name}:${this.devtoolsEventLog.length}`,
      name,
      payload: serializeDevtoolsValue(payload),
      sender,
      timestamp,
      toPeerId: toPeerId ?? null,
    });
  }

  private recordDevtoolsError(message: string): void {
    this.devtoolsErrors = appendDevtoolsError(this.devtoolsErrors, message);
  }

  private ensureDevtoolsStateTracking<T>(
    stateEngine: StateEngine<T>,
    strategy: 'lww' | 'crdt',
  ): void {
    if (this.devtoolsStateTracker?.strategy === strategy) {
      return;
    }

    this.devtoolsStateTracker?.unsubscribe();

    const initialMeta =
      strategy === 'lww' && this.stateSnapshot
        ? {
            reason: this.stateSnapshot.reason,
            changedBy: this.stateSnapshot.changedBy,
            timestamp: this.stateSnapshot.timestamp,
            ...this.getStateSyncMeta(),
          }
        : null;

    this.setDevtoolsStateSnapshot(stateEngine.get(), initialMeta);

    const unsubscribe = stateEngine.subscribe((value, meta) => {
      this.setDevtoolsStateSnapshot(value, meta);
    });

    this.devtoolsStateTracker = {
      strategy,
      unsubscribe,
    };
  }

  private setDevtoolsStateSnapshot(value: unknown, meta: StateChangeMeta | null): void {
    const nextValue = serializeDevtoolsValue(value);
    this.devtoolsStateDiff =
      this.devtoolsStateValue === null
        ? []
        : diffSerializedState(this.devtoolsStateValue, nextValue);
    this.devtoolsStateValue = nextValue;
    this.devtoolsStateMeta = meta;
  }

  private injectSimulatedPeer(): DevtoolsCommandResult {
    if (this.simulatedPeerRoom) {
      return {
        ok: true,
      };
    }

    const simulatedPresence = sanitizePresencePatch(this.options.presence ?? {});
    Reflect.set(simulatedPresence, 'name', 'Simulated Peer');
    Reflect.set(simulatedPresence, 'color', '#F97316');
    Reflect.set(simulatedPresence, 'simulated', true);

    const simulatedRoom = new RoomImpl<TPresence>(
      this.id,
      {
        ...this.options,
        presence: simulatedPresence,
      },
      {
        hideFromDevtools: true,
      },
    );

    this.simulatedPeerRoom = simulatedRoom;
    void simulatedRoom.connect().catch((error) => {
      if (this.simulatedPeerRoom === simulatedRoom) {
        this.simulatedPeerRoom = null;
      }

      this.recordDevtoolsError(
        error instanceof Error ? error.message : 'Failed to connect the simulated peer.',
      );
    });

    return {
      ok: true,
    };
  }

  private disconnectSimulatedPeer(): DevtoolsCommandResult {
    const simulatedRoom = this.simulatedPeerRoom;
    if (!simulatedRoom) {
      return {
        ok: true,
      };
    }

    this.simulatedPeerRoom = null;
    void simulatedRoom.disconnect().catch((error) => {
      this.recordDevtoolsError(
        error instanceof Error ? error.message : 'Failed to disconnect the simulated peer.',
      );
    });

    return {
      ok: true,
    };
  }

  public get status(): RoomStatus {
    return this.currentStatus;
  }

  public get peers(): Peer<TPresence>[] {
    return this.peerRegistry.getRemotes();
  }

  public get peerCount(): number {
    return this.peerRegistry.getRemoteCount();
  }

  public connect(): Promise<void> {
    this.ensureDevtoolsAdapterRegistered();

    if (this.currentStatus === 'connected') {
      return Promise.resolve();
    }

    if (this.reconnectPromise) {
      return this.reconnectPromise;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const task = this.connectInternal({
      isReconnectAttempt:
        this.hasConnectedBefore &&
        (this.currentStatus === 'disconnected' || this.currentStatus === 'error'),
    });
    this.connectionPromise = task;

    void task.then(
      () => {
        if (this.connectionPromise === task) {
          this.connectionPromise = null;
        }
      },
      () => {
        if (this.connectionPromise === task) {
          this.connectionPromise = null;
        }
      },
    );

    return task;
  }

  public async disconnect(): Promise<void> {
    this.cancelReconnect();
    this.cancelOfflineQueueReplay();
    this.offlineReplayRequested = false;
    this.offlineWindowActive = false;
    this.connectStartedAt = null;
    this.disconnectSimulatedPeer();
    this.websocketFallbackTransportPreference = null;

    if (this.reconnectPromise) {
      await this.reconnectPromise.catch(() => {
        return undefined;
      });
    }

    if (this.connectionPromise) {
      await this.connectionPromise.catch(() => {
        return undefined;
      });
    }

    this.unregisterUnloadHandlers();
    this.stopPresenceHeartbeat();

    if (!this.transport) {
      this.activeTransportKind = null;
      this.lastDisconnectReason = 'manual';
      this.logger.info('transport', 'transport', 'Transport disconnected', {
        reason: 'manual',
        transport: null,
      });
      this.clearRemoteState();
      this.unregisterDevtoolsAdapter();
      this.setStatus('disconnected');
      this.roomEventEmitter.emit('disconnected', { reason: 'manual' });
      return;
    }

    this.yjsController?.prepareForDisconnect();

    this.sendSignal({
      type: 'leave',
      payload: {
        peer: this.selfPeer,
      },
    });
    await this.flushOutboundSignalQueue();

    this.transportUnsubscribe?.();
    this.transportUnsubscribe = null;

    await this.transport.disconnect();
    this.transport = null;
    this.activeTransportKind = null;

    this.lastDisconnectReason = 'manual';
    this.logger.info('transport', 'transport', 'Transport disconnected', {
      reason: 'manual',
      transport: null,
    });
    this.clearRemoteState();
    this.unregisterDevtoolsAdapter();

    this.setStatus('disconnected');
    this.roomEventEmitter.emit('disconnected', { reason: 'manual' });
  }

  public async getDiagnostics(): Promise<RoomDiagnostics> {
    return {
      timestamp: Date.now(),
      roomId: this.id,
      peerId: this.peerId,
      status: this.currentStatus,
      transport: {
        current: this.activeTransportKind,
        lastDisconnectReason: this.lastDisconnectReason,
        reconnectAttempt: this.reconnectAttempt,
      },
      debug: {
        ...this.logger.resolvedDebug,
        productionInfoSuppressed: this.logger.productionInfoSuppressed,
      },
      peers: {
        remoteCount: this.peerRegistry.getRemoteCount(),
        remotePeerIds: this.peers
          .map((peer) => {
            return peer.id;
          })
          .sort(),
      },
      presence: {
        selfLastSeen: this.selfPeer.lastSeen,
        heartbeatActive: this.presenceHeartbeat !== null,
      },
      state: {
        configured: this.stateConfigured,
        strategy: this.stateStrategy,
        persistenceEnabled: this.statePersistenceEnabled,
        queuedMutationCount: this.getQueuedStateMutationCount(),
        offlineReplayInProgress: this.offlineReplayInProgress,
        stateSizeBytes: this.getStateSizeBytes(),
      },
      events: {
        registeredEventNames: this.getRegisteredEventNames(),
        messagesSent: this.customEventMessagesSent,
        messagesReceived: this.customEventMessagesReceived,
        broadcastsSent: this.customEventBroadcastsSent,
        directSends: this.customEventDirectSends,
        latestConnectDurationMs: this.latestConnectDurationMs,
      },
      encryption: {
        enabled: this.encryptionEnabled,
        incompatiblePeerIds: Array.from(this.incompatibleEncryptionPeers).sort(),
        decryptionErrorPeerIds: Array.from(this.decryptionErrorPeers).sort(),
      },
    };
  }

  public usePresence(): PresenceEngine<TPresence> {
    if (!this.presenceEngineInstance) {
      this.presenceEngineInstance = createPresenceEngine({
        updateSelf: (data) => {
          this.updateSelfPresence(data);
        },
        replaceSelf: (data) => {
          this.replaceSelfPresence(data);
        },
        getSelf: () => {
          return this.peerRegistry.getSelf();
        },
        getPeer: (peerId) => {
          return this.peerRegistry.get(peerId);
        },
        getAllPeers: () => {
          return this.peerRegistry.getAll();
        },
        subscribe: (callback) => {
          this.peerSubscribers.add(callback);
          callback(this.peerRegistry.getAll());

          return () => {
            this.peerSubscribers.delete(callback);
          };
        },
      });
    }

    return this.presenceEngineInstance;
  }

  public useCursors<TCursor extends CursorData = CursorData>(
    options?: CursorOptions,
  ): CursorEngine<TCursor> {
    if (!this.cursorEngineInstance) {
      const getRemoteCursorPositions = (): CursorPosition[] => {
        return Array.from(this.cursorPositions.values()).filter((position) => {
          return position.userId !== this.peerId;
        });
      };

      this.cursorEngineInstance = createCursorEngine(
        {
          setSelfPosition: (position) => {
            this.setSelfCursorPosition(position);
          },
          getPositions: () => {
            return getRemoteCursorPositions();
          },
          subscribe: (callback) => {
            const wrappedCallback = (): void => {
              callback(getRemoteCursorPositions());
            };

            this.cursorSubscribers.add(wrappedCallback);
            wrappedCallback();

            return () => {
              this.cursorSubscribers.delete(wrappedCallback);
            };
          },
        },
        options,
      );
    }

    return readTypedCursorEngine<TCursor>(this.cursorEngineInstance);
  }

  public useState<T>(options: StateOptions<T>): StateEngine<T> {
    const strategy = this.resolveRequestedStateStrategy(options.strategy);
    this.assertSupportedStatePersistence(strategy, options.persist);

    if (!this.stateEngineInstance) {
      const stateEngine =
        strategy === 'crdt'
          ? this.createCrdtStateEngine(options)
          : this.createLwwStateEngine(options);
      this.stateEngineInstance = stateEngine;
      this.ensureDevtoolsStateTracking(stateEngine, strategy);
      return stateEngine;
    }

    this.assertCompatibleStateStrategy(options.strategy);

    if (strategy === 'lww' && options.persist === true) {
      this.enableStatePersistence();
    }

    const stateEngine = readTypedStateEngine<T>(this.stateEngineInstance);
    this.ensureDevtoolsStateTracking(stateEngine, strategy);
    return stateEngine;
  }

  public getYDoc(): FlockYjsProvider['doc'] {
    return this.getOrCreateYjsController().doc;
  }

  public getYProvider(): FlockYjsProvider {
    return this.getOrCreateYjsController();
  }

  public useAwareness(): AwarenessEngine {
    if (!this.awarenessEngineInstance) {
      this.awarenessEngineInstance = createAwarenessEngine({
        updateSelfAwareness: (patch) => {
          if (this.yjsController) {
            this.yjsController.updateLocalAwareness(patch);
            return;
          }

          const existing = this.awarenessByPeer.get(this.peerId) ?? { peerId: this.peerId };
          const next: AwarenessState = {
            ...existing,
            ...patch,
            peerId: this.peerId,
          };

          this.awarenessByPeer.set(this.peerId, next);
          this.sendSignal({
            type: 'awareness:update',
            payload: { awareness: next },
          });
          this.notifyAwarenessSubscribers();
        },
        getAllAwareness: () => {
          return this.getAwarenessSnapshot();
        },
        subscribeAwareness: (callback) => {
          this.awarenessSubscribers.add(callback);
          callback(this.getRemoteAwarenessSnapshot());

          return () => {
            this.awarenessSubscribers.delete(callback);
          };
        },
      });
    }

    return this.awarenessEngineInstance;
  }

  public useEvents(options?: EventOptions): EventEngine<TPresence> {
    return createEventEngine(
      {
        emitEvent: (name, payload, toPeerId, loopback) => {
          const eventPayload = {
            name,
            payload,
            loopback,
          };
          const queued = this.shouldQueueOfflineWork();

          this.recordDevtoolsEvent('outgoing', name, payload, this.selfPeer, toPeerId);
          this.customEventMessagesSent += 1;
          if (toPeerId) {
            this.customEventDirectSends += 1;
          } else {
            this.customEventBroadcastsSent += 1;
          }
          this.logger.info('events', 'events', 'Outbound event emitted', {
            eventName: name,
            loopback,
            queued,
            targetPeerId: toPeerId ?? null,
          });
          this.logger.info('performance', 'performance', 'Custom event counters updated', {
            broadcastsSent: this.customEventBroadcastsSent,
            directSends: this.customEventDirectSends,
            messagesReceived: this.customEventMessagesReceived,
            messagesSent: this.customEventMessagesSent,
            queuedEventCount: this.offlineQueue.length,
          });

          const eventSignal: Omit<
            Extract<RoomTransportSignal, { type: 'event' }>,
            'roomId' | 'fromPeerId' | 'timestamp'
          > = toPeerId !== undefined
            ? {
                type: 'event',
                toPeerId,
                payload: eventPayload,
              }
            : {
                type: 'event',
                payload: eventPayload,
              };

          const outboundSignal = this.createOutboundSignal(eventSignal);
          if (outboundSignal) {
            if (queued) {
              this.queueOfflineEventSignal(outboundSignal);
            } else {
              this.dispatchRoomSignal(outboundSignal);
            }
          }

          if (loopback && (!toPeerId || toPeerId === this.peerId)) {
            this.emitCustomEvent(name, payload, this.selfPeer);
          }
        },
        onEvent: (name, callback) => {
          const handlers =
            this.customEventHandlers.get(name) ?? new Set<InternalEventCallback<TPresence>>();
          handlers.add(callback as InternalEventCallback<TPresence>);
          this.customEventHandlers.set(name, handlers);

          return () => {
            this.removeCustomEventHandler(name, callback as InternalEventCallback<TPresence>);
          };
        },
        offEvent: (name, callback) => {
          this.removeCustomEventHandler(name, callback as InternalEventCallback<TPresence>);
        },
      },
      options,
    );
  }

  private createInstrumentedStateEngine<T>(
    engine: StateEngine<T>,
    strategy: 'lww' | 'crdt',
  ): StateEngine<T> {
    const logMutation = (reason: StateChangeMeta['reason']): void => {
      const stateSizeBytes = this.getStateSizeBytes();

      this.logger.info('state', 'state', 'Local state mutation applied', {
        queuedMutationCount: this.getQueuedStateMutationCount(),
        reason,
        strategy,
      });

      if (stateSizeBytes !== null) {
        this.logger.info('performance', 'performance', 'State snapshot size recorded', {
          queuedMutationCount: this.getQueuedStateMutationCount(),
          reason,
          stateSizeBytes,
          strategy,
        });
      }
    };

    return {
      get() {
        return engine.get();
      },
      set: (value) => {
        engine.set(value);
        logMutation('set');
      },
      patch: (partial) => {
        engine.patch(partial);
        logMutation('patch');
      },
      subscribe(cb) {
        return engine.subscribe(cb);
      },
      undo: () => {
        engine.undo();
        logMutation('undo');
      },
      reset: () => {
        engine.reset();
        logMutation('reset');
      },
    };
  }

  private createLwwStateEngine<T>(options: StateOptions<T>): StateEngine<T> {
    this.configureLwwState(options);
    const baseStateEngine = createStateEngine<T>(options, {
      actorId: this.peerId,
      getInitialValue: () => {
        return readTypedStateStoredValue<T>(this.stateInitialValue);
      },
      getValue: () => {
        return readTypedStateValue<T>(this.requireStateSnapshot());
      },
      getSnapshot: () => {
        return this.requireStateSnapshot();
      },
      subscribeSnapshots: (callback) => {
        this.stateSnapshotSubscribers.add(callback);
        return () => {
          this.stateSnapshotSubscribers.delete(callback);
        };
      },
      getSyncMeta: () => {
        return this.getStateSyncMeta();
      },
      commitChange: (change) => {
        const shouldQueue = this.shouldQueueOfflineWork();
        if (shouldQueue) {
          this.setOfflineQueue(
            appendOfflineQueueEntry(this.offlineQueue, {
              type: 'state',
              mutation: createOfflineStateMutation(
                change.mutation.reason,
                change.snapshot.changedBy,
                change.snapshot.timestamp,
                'payload' in change.mutation ? change.mutation.payload : undefined,
              ),
              snapshot: change.snapshot,
            }),
            false,
          );
        }

        const snapshot = change.snapshot;
        this.setStateSnapshot(snapshot, {
          synced: !shouldQueue,
        });

        if (shouldQueue) {
          this.scheduleOfflineQueueReplay();
          return;
        }

        this.sendStateSnapshot(snapshot);
      },
    });

    this.logger.info('state', 'state', 'State engine configured', {
      persistenceEnabled: this.statePersistenceEnabled,
      strategy: 'lww',
    });

    return this.createInstrumentedStateEngine(baseStateEngine, 'lww');
  }

  private createCrdtStateEngine<T>(options: StateOptions<T>): StateEngine<T> {
    this.configureCrdtState(options);
    const baseStateEngine = createCrdtStateEngineRuntime<T>(options, {
      actorId: this.peerId,
      doc: this.getOrCreateYjsController().doc,
      getInitialValue: () => {
        return readTypedStateStoredValue<T>(this.stateInitialValue);
      },
    });

    this.logger.info('state', 'state', 'State engine configured', {
      persistenceEnabled: this.statePersistenceEnabled,
      strategy: 'crdt',
    });

    return this.createInstrumentedStateEngine(baseStateEngine, 'crdt');
  }

  private resolveRequestedStateStrategy(
    strategy: StateOptions<unknown>['strategy'],
  ): 'lww' | 'crdt' {
    const normalized = strategy ?? this.stateStrategy ?? 'lww';
    if (normalized !== 'lww' && normalized !== 'crdt') {
      throw createFlockError(
        'INVALID_STATE',
        `State strategy "${normalized}" is not implemented in this runtime. Use "lww" or "crdt".`,
        false,
        {
          strategy: normalized,
        },
      );
    }

    if (this.stateStrategy && normalized !== this.stateStrategy) {
      throw createFlockError(
        'INVALID_STATE',
        `Room state is already configured with strategy "${this.stateStrategy}".`,
        false,
        {
          currentStrategy: this.stateStrategy,
          requestedStrategy: normalized,
        },
      );
    }

    return normalized;
  }

  private assertCompatibleStateStrategy(strategy: StateOptions<unknown>['strategy']): void {
    void this.resolveRequestedStateStrategy(strategy);
  }

  private assertSupportedStatePersistence(
    strategy: 'lww' | 'crdt',
    persist: StateOptions<unknown>['persist'],
  ): void {
    if (persist !== true || strategy === 'lww') {
      return;
    }

    throw createFlockError(
      'INVALID_STATE',
      'State persistence is only supported for the "lww" strategy.',
      false,
      {
        strategy,
        persist,
      },
    );
  }

  private enableStatePersistence(): void {
    if (this.statePersistenceEnabled) {
      return;
    }

    this.statePersistenceEnabled = true;

    if (this.stateStrategy === 'lww' && this.stateSnapshot) {
      this.persistStateSnapshot(this.stateSnapshot);
    }
  }

  private getOrCreateYjsController(): RoomYjsController<TPresence> {
    if (this.yjsController) {
      return this.yjsController;
    }

    const controller = new RoomYjsController<TPresence>({
      peerId: this.peerId,
      connectRoom: () => {
        return this.connect();
      },
      disconnectRoom: () => {
        return this.disconnect();
      },
      getSelfPeer: () => {
        return this.selfPeer;
      },
      sendSignal: (signal) => {
        this.sendSignal(signal);
      },
    });

    controller.awareness.on('change', () => {
      this.notifyAwarenessSubscribers();
    });

    const legacySelfAwareness = this.awarenessByPeer.get(this.peerId);
    if (legacySelfAwareness) {
      const rest: Record<string, unknown> = {
        ...legacySelfAwareness,
      };
      delete rest.peerId;
      if (Object.keys(rest).length > 0) {
        controller.updateLocalAwareness(rest);
      }
    }

    this.yjsController = controller;

    if (this.currentStatus === 'connected') {
      controller.handleRoomConnected();
      for (const peer of this.peers) {
        controller.syncPeer(peer.id);
      }
    }

    return controller;
  }

  public on<TEvent extends RoomEventName>(
    event: TEvent,
    cb: RoomEventHandler<TPresence, TEvent>,
  ): Unsubscribe {
    return this.roomEventEmitter.on(event, cb);
  }

  public off<TEvent extends RoomEventName>(
    event: TEvent,
    cb: RoomEventHandler<TPresence, TEvent>,
  ): void {
    this.roomEventEmitter.off(event, cb);
  }

  private enqueueSignal(signal: TransportSignal): void {
    if (!this.encryptionEnabled) {
      void this.handleSignal(signal);
      return;
    }

    const task = this.inboundSignalQueue.then(async () => {
      try {
        await this.handleSignal(signal);
      } catch (error) {
        this.emitRoomError(
          error instanceof FlockError
            ? error
            : createFlockError(
                'NETWORK_ERROR',
                error instanceof Error ? error.message : 'Failed to process inbound room signal.',
                true,
                error,
              ),
        );
      }
    });

    this.inboundSignalQueue = task.catch(() => {
      return undefined;
    });
  }

  private queueOutboundSignal(signal: RoomTransportSignal): void {
    if (!this.encryptionEnabled) {
      const transport = this.transport;
      if (!transport) {
        return;
      }

      if (signal.toPeerId) {
        transport.send(signal);
        return;
      }

      transport.broadcast(signal);
      return;
    }

    const task = this.outboundSignalQueue.then(async () => {
      try {
        await this.dispatchOutboundSignal(signal);
      } catch (error) {
        this.emitRoomError(
          error instanceof FlockError
            ? error
            : createFlockError(
                'ENCRYPTION_ERROR',
                error instanceof Error ? error.message : 'Failed to encrypt outbound room signal.',
                true,
                error,
              ),
        );
      }
    });

    this.outboundSignalQueue = task.catch(() => {
      return undefined;
    });
  }

  private async flushOutboundSignalQueue(): Promise<void> {
    await this.outboundSignalQueue.catch(() => {
      return undefined;
    });
  }

  private async ensureEncryptionContext(): Promise<ResolvedRoomEncryption | null> {
    if (!this.encryptionEnabled) {
      this.encryptionContext = null;
      this.encryptionContextPromise = null;
      return null;
    }

    if (this.encryptionContext) {
      return this.encryptionContext;
    }

    if (!this.encryptionContextPromise) {
      this.encryptionContextPromise = resolveRoomEncryption(this.id, this.options.encryption);
    }

    const resolved = await this.encryptionContextPromise;
    this.encryptionContext = resolved;
    return resolved;
  }

  private getBootstrapPeer(): Peer<TPresence> {
    if (!this.encryptionEnabled) {
      return this.selfPeer;
    }

    return coerceTypedPeer<TPresence>({
      id: this.selfPeer.id,
      joinedAt: this.selfPeer.joinedAt,
      lastSeen: this.selfPeer.lastSeen,
    });
  }

  private createBootstrapPayload(
    kind: TransportKind,
  ): Extract<RoomTransportSignal, { type: 'hello' | 'welcome' }>['payload'] {
    return {
      peer: this.getBootstrapPeer(),
      protocol: getTransportProtocolCapabilities(kind),
      ...(this.encryptionEnabled ? { encryption: createEncryptionHandshake() } : {}),
    };
  }

  private buildEncryptionHeader(signal: RoomTransportSignal): EncryptionEnvelopeHeader {
    return {
      roomId: signal.roomId,
      fromPeerId: signal.fromPeerId,
      ...(signal.toPeerId ? { toPeerId: signal.toPeerId } : {}),
      timestamp: signal.timestamp,
      version: 1,
    };
  }

  private emitPeerEncryptionModeError(peerId: string, reason: string, cause?: unknown): void {
    if (this.incompatibleEncryptionPeers.has(peerId)) {
      return;
    }

    this.incompatibleEncryptionPeers.add(peerId);
    this.emitRoomError(
      createFlockError('ENCRYPTION_ERROR', reason, true, {
        source: 'room-encryption',
        kind: 'peer-mode-mismatch',
        peerId,
        ...(cause !== undefined ? { cause } : {}),
      }),
    );
  }

  private validatePeerEncryptionMode(
    signal: Extract<RoomTransportSignal, { type: 'hello' | 'welcome' }>,
  ): boolean {
    const remoteEncrypted = signal.payload.encryption?.version === 1;
    if (remoteEncrypted === this.encryptionEnabled) {
      this.incompatibleEncryptionPeers.delete(signal.fromPeerId);
      this.decryptionErrorPeers.delete(signal.fromPeerId);
      return true;
    }

    this.emitPeerEncryptionModeError(
      signal.fromPeerId,
      `Peer encryption mode mismatch for ${signal.fromPeerId}.`,
      {
        localEncrypted: this.encryptionEnabled,
        remoteEncrypted,
      },
    );
    return false;
  }

  private emitPeerDecryptionError(peerId: string, error: FlockError): void {
    if (this.decryptionErrorPeers.has(peerId)) {
      return;
    }

    this.decryptionErrorPeers.add(peerId);
    this.emitRoomError(error);
  }

  private clearPeerRuntimeState(peerId: string): void {
    const cursorDeleted = this.cursorPositions.delete(peerId);
    const awarenessDeleted = this.awarenessByPeer.delete(peerId);
    this.yjsController?.handlePeerLeft(peerId);

    if (cursorDeleted) {
      this.notifyCursorSubscribers();
    }

    if (awarenessDeleted) {
      this.notifyAwarenessSubscribers();
    }
  }

  private createMalformedEncryptedSignalError(
    signal: Extract<RoomTransportSignal, { type: 'encrypted' }>,
    reason: string,
    cause?: unknown,
  ): FlockError {
    return createFlockError(
      'DECRYPTION_ERROR',
      `Failed to decrypt message from ${signal.fromPeerId}.`,
      true,
      {
        source: 'room-encryption',
        kind: reason,
        roomId: signal.roomId,
        fromPeerId: signal.fromPeerId,
        ...(cause !== undefined ? { cause } : {}),
      },
    );
  }

  private async dispatchOutboundSignal(signal: RoomTransportSignal): Promise<void> {
    const transport = this.transport;
    if (!transport) {
      return;
    }

    const outboundSignal = await this.resolveOutboundTransportSignal(signal);
    if (outboundSignal.toPeerId) {
      transport.send(outboundSignal);
      return;
    }

    transport.broadcast(outboundSignal);
  }

  private async resolveOutboundTransportSignal(
    signal: RoomTransportSignal,
  ): Promise<RoomTransportSignal> {
    if (!this.encryptionContext || isBootstrapSignal(signal) || signal.type === 'encrypted') {
      return signal;
    }

    const plaintext = normalizeTransportSerializationResult(encodeMessagePack(signal));
    const encryptedPayload = await encryptWirePayload(
      plaintext,
      this.buildEncryptionHeader(signal),
      this.encryptionContext.key,
    );

    return {
      type: 'encrypted',
      roomId: signal.roomId,
      fromPeerId: signal.fromPeerId,
      ...(signal.toPeerId ? { toPeerId: signal.toPeerId } : {}),
      timestamp: signal.timestamp,
      payload: encryptedPayload,
    };
  }

  private async handleEncryptedSignal(
    signal: Extract<RoomTransportSignal, { type: 'encrypted' }>,
  ): Promise<void> {
    if (!this.encryptionEnabled || !this.encryptionContext) {
      this.emitPeerEncryptionModeError(
        signal.fromPeerId,
        `Received encrypted message from ${signal.fromPeerId} while encryption is disabled.`,
      );
      return;
    }

    try {
      const plaintext = await decryptWirePayload(
        signal.payload,
        this.buildEncryptionHeader(signal),
        this.encryptionContext.key,
      );
      const decoded = decodeMessagePack(plaintext);
      if (!decoded.ok) {
        throw this.createMalformedEncryptedSignalError(
          signal,
          'invalid-inner-payload',
          decoded.error,
        );
      }

      const innerSignal = parseTransportSignal(decoded.value);
      if (!innerSignal || innerSignal.type === 'encrypted') {
        throw this.createMalformedEncryptedSignalError(
          signal,
          'invalid-inner-signal',
          decoded.value,
        );
      }

      if (!hasMatchingEncryptedSignalHeaders(signal, innerSignal)) {
        throw this.createMalformedEncryptedSignalError(signal, 'header-mismatch', innerSignal);
      }

      this.decryptionErrorPeers.delete(signal.fromPeerId);
      this.handleRoomSignal(innerSignal);
    } catch (error) {
      const decryptionError =
        error instanceof FlockError
          ? error
          : this.createMalformedEncryptedSignalError(signal, 'decrypt-failed', error);
      this.clearPeerRuntimeState(signal.fromPeerId);
      this.emitPeerDecryptionError(signal.fromPeerId, decryptionError);
    }
  }

  private async connectInternal(context: ConnectContext): Promise<void> {
    if (context.isReconnectAttempt) {
      this.reconnectAttempt += 1;
      this.setStatus('reconnecting');
      this.roomEventEmitter.emit('reconnecting', { attempt: this.reconnectAttempt });
    }

    this.connectStartedAt = Date.now();
    this.setStatus('connecting');
    this.logger.info('transport', 'transport', 'Transport connect attempt started', {
      isReconnectAttempt: context.isReconnectAttempt,
      requestedTransport: this.options.transport ?? 'auto',
      reconnectAttempt: this.reconnectAttempt,
    });

    try {
      await this.ensureEncryptionContext();
      const transport = await this.openTransportAttempt();
      this.activateConnectedTransport(transport);
    } catch (error) {
      this.failInitialConnect(error);
    }
  }

  private setStatus(status: RoomStatus): void {
    this.currentStatus = status;
  }

  private registerUnloadHandlers(): void {
    if (this.unloadHandlersRegistered) {
      return;
    }

    const eventTarget = getWindowEventTarget();
    if (!eventTarget) {
      return;
    }

    eventTarget.addEventListener('beforeunload', this.onBeforeUnload);
    eventTarget.addEventListener('pagehide', this.onPageHide);

    this.unloadEventTarget = eventTarget;
    this.unloadHandlersRegistered = true;
  }

  private unregisterUnloadHandlers(): void {
    if (!this.unloadHandlersRegistered) {
      return;
    }

    const eventTarget = this.unloadEventTarget;
    if (eventTarget) {
      eventTarget.removeEventListener('beforeunload', this.onBeforeUnload);
      eventTarget.removeEventListener('pagehide', this.onPageHide);
    }

    this.unloadEventTarget = null;
    this.unloadHandlersRegistered = false;
  }

  private handleWindowUnload(): void {
    void this.disconnect();
  }

  private shouldHandleSignal(signal: TransportSignal): boolean {
    if (signal.roomId !== this.id) {
      return false;
    }

    if (signal.fromPeerId === this.peerId && !isInternalTransportSignal(signal)) {
      return false;
    }

    if ('toPeerId' in signal && signal.toPeerId && signal.toPeerId !== this.peerId) {
      return false;
    }

    return true;
  }

  private async handleSignal(signal: TransportSignal): Promise<void> {
    if (!this.shouldHandleSignal(signal)) {
      return;
    }

    if (signal.type === 'transport:error') {
      this.handleTransportErrorSignal(signal.payload);
      return;
    }

    if (signal.type === 'transport:disconnected') {
      await this.handleTransportDisconnectedSignal(signal.payload);
      return;
    }

    if (signal.type === 'encrypted') {
      await this.handleEncryptedSignal(signal);
      return;
    }

    if (this.encryptionEnabled && !isPlaintextEncryptedRoomControlSignal(signal)) {
      this.emitPeerEncryptionModeError(
        signal.fromPeerId,
        `Received plaintext ${signal.type} from ${signal.fromPeerId} while encryption is enabled.`,
      );
      return;
    }

    this.handleRoomSignal(signal);
  }

  private handleRoomSignal(signal: RoomTransportSignal): void {
    switch (signal.type) {
      case 'hello':
        this.handleHelloSignal(signal);
        return;
      case 'welcome':
      case 'presence:update':
        this.handlePresenceSignal(signal);
        return;
      case 'leave':
        this.handleLeaveSignal(signal);
        return;
      case 'cursor:update':
        this.handleCursorSignal(signal);
        return;
      case 'state:update':
        this.handleStateSignal(signal);
        return;
      case 'awareness:update':
        this.handleAwarenessSignal(signal);
        return;
      case 'crdt:sync':
        this.handleCrdtSyncSignal(signal);
        return;
      case 'crdt:awareness':
        this.handleCrdtAwarenessSignal(signal);
        return;
      case 'event':
        this.handleCustomEventSignal(signal);
        return;
      default:
        return;
    }
  }

  private handleHelloSignal(signal: Extract<RoomTransportSignal, { type: 'hello' }>): void {
    if (!this.validatePeerEncryptionMode(signal)) {
      this.sendSignal({
        type: 'welcome',
        toPeerId: signal.fromPeerId,
        payload: this.createBootstrapPayload(this.transport?.kind ?? 'in-memory'),
      });
      return;
    }

    this.peerRegistry.upsertRemote(coerceTypedPeer<TPresence>(signal.payload.peer));
    this.logger.info('presence', 'presence', 'Peer hello received', {
      peerId: signal.fromPeerId,
      transport: this.activeTransportKind,
    });
    this.sendSignal({
      type: 'welcome',
      toPeerId: signal.fromPeerId,
      payload: this.createBootstrapPayload(this.transport?.kind ?? 'in-memory'),
    });

    if (this.encryptionEnabled) {
      void this.sendSelfPresence(signal.fromPeerId);
    }

    if (this.stateSnapshot && !hasQueuedStateMutations(this.offlineQueue)) {
      this.sendStateSnapshot(this.stateSnapshot, signal.fromPeerId);
    }

    this.yjsController?.syncPeer(signal.fromPeerId);
  }

  private handlePresenceSignal(
    signal:
      | Extract<RoomTransportSignal, { type: 'welcome' }>
      | Extract<RoomTransportSignal, { type: 'presence:update' }>,
  ): void {
    if (signal.type === 'welcome' && !this.validatePeerEncryptionMode(signal)) {
      return;
    }

    this.peerRegistry.upsertRemote(coerceTypedPeer<TPresence>(signal.payload.peer));
    this.logger.info(
      'presence',
      'presence',
      signal.type === 'welcome' ? 'Peer welcome received' : 'Remote presence updated',
      {
        peerId: signal.fromPeerId,
      },
    );

    if (signal.type === 'welcome') {
      void this.sendSelfPresence(signal.fromPeerId);
      this.yjsController?.syncPeer(signal.fromPeerId);
      this.scheduleOfflineQueueReplay();
    }
  }

  private handleLeaveSignal(signal: Extract<RoomTransportSignal, { type: 'leave' }>): void {
    this.incompatibleEncryptionPeers.delete(signal.fromPeerId);
    this.decryptionErrorPeers.delete(signal.fromPeerId);
    this.logger.info('presence', 'presence', 'Remote peer leave received', {
      peerId: signal.fromPeerId,
    });
    const peer = signal.payload.peer;
    this.yjsController?.handlePeerLeft(signal.fromPeerId);

    if (peer && peer.id === signal.fromPeerId) {
      this.peerRegistry.removeRemoteImmediately(signal.fromPeerId);
      return;
    }

    this.peerRegistry.markRemoteDisconnected(signal.fromPeerId);
  }

  private handleCursorSignal(
    signal: Extract<RoomTransportSignal, { type: 'cursor:update' }>,
  ): void {
    this.cursorPositions.set(signal.fromPeerId, signal.payload.cursor);
    this.notifyCursorSubscribers();
  }

  private handleStateSignal(signal: Extract<RoomTransportSignal, { type: 'state:update' }>): void {
    const incomingSnapshot = cloneStateSnapshot(signal.payload);
    const comparisonSnapshot = this.syncedStateSnapshot ?? this.stateSnapshot;
    if (!comparisonSnapshot || compareStateSnapshots(incomingSnapshot, comparisonSnapshot) > 0) {
      this.setSyncedStateSnapshot(incomingSnapshot);
      if (hasQueuedStateMutations(this.offlineQueue)) {
        this.reconcileQueuedStateSnapshot();
      } else {
        this.setStateSnapshot(incomingSnapshot);
      }

      this.logger.info('state', 'state', 'Remote state snapshot accepted', {
        fromPeerId: signal.fromPeerId,
        queuedMutationCount: this.getQueuedStateMutationCount(),
        snapshotTimestamp: incomingSnapshot.timestamp,
      });

      const stateSizeBytes = computeSerializedStateSizeBytes(incomingSnapshot.value);
      if (stateSizeBytes !== null) {
        this.logger.info('performance', 'performance', 'State snapshot size recorded', {
          fromPeerId: signal.fromPeerId,
          source: 'remote',
          stateSizeBytes,
        });
      }
    } else {
      this.logger.warn('state', 'state', 'Remote state snapshot ignored', {
        currentTimestamp: comparisonSnapshot.timestamp,
        fromPeerId: signal.fromPeerId,
        snapshotTimestamp: incomingSnapshot.timestamp,
      });
    }

    this.scheduleOfflineQueueReplay();
  }

  private handleAwarenessSignal(
    signal: Extract<RoomTransportSignal, { type: 'awareness:update' }>,
  ): void {
    if (this.yjsController) {
      return;
    }

    this.awarenessByPeer.set(signal.fromPeerId, signal.payload.awareness);
    this.notifyAwarenessSubscribers();
  }

  private handleCrdtSyncSignal(signal: Extract<RoomTransportSignal, { type: 'crdt:sync' }>): void {
    this.getOrCreateYjsController().handleSyncSignal(
      signal.fromPeerId,
      signal.payload,
      signal.timestamp,
    );
  }

  private handleCrdtAwarenessSignal(
    signal: Extract<RoomTransportSignal, { type: 'crdt:awareness' }>,
  ): void {
    this.getOrCreateYjsController().handleAwarenessSignal(signal.payload);
    this.notifyAwarenessSubscribers();
  }

  private handleCustomEventSignal(signal: Extract<RoomTransportSignal, { type: 'event' }>): void {
    const fromPeer = this.peerRegistry.get(signal.fromPeerId);
    if (!fromPeer) {
      return;
    }

    this.customEventMessagesReceived += 1;
    this.recordDevtoolsEvent(
      'incoming',
      signal.payload.name,
      signal.payload.payload,
      fromPeer,
      signal.toPeerId,
    );
    this.logger.info('events', 'events', 'Inbound event delivered', {
      eventName: signal.payload.name,
      fromPeerId: fromPeer.id,
      targetPeerId: signal.toPeerId ?? null,
    });
    this.logger.info('performance', 'performance', 'Custom event counters updated', {
      broadcastsSent: this.customEventBroadcastsSent,
      directSends: this.customEventDirectSends,
      messagesReceived: this.customEventMessagesReceived,
      messagesSent: this.customEventMessagesSent,
    });
    this.emitCustomEvent(signal.payload.name, signal.payload.payload, fromPeer);
  }

  private handleTransportErrorSignal(payload: { error: FlockError }): void {
    this.emitRoomError(toTransportError(payload.error));
  }

  private async handleTransportDisconnectedSignal(payload: { reason?: string }): Promise<void> {
    if (
      !this.transport &&
      (this.currentStatus === 'disconnected' || this.currentStatus === 'reconnecting')
    ) {
      return;
    }

    this.cancelOfflineQueueReplay();
    this.offlineReplayRequested = false;
    this.unregisterUnloadHandlers();
    this.stopPresenceHeartbeat();

    const reason = payload.reason ?? 'transport-disconnected';
    this.lastDisconnectReason = reason;
    this.connectStartedAt = null;
    this.logger.info('transport', 'transport', 'Transport disconnected', {
      reason,
      transport: this.activeTransportKind,
    });

    if (!this.offlineWindowActive) {
      this.offlineWindowActive = true;
      this.roomEventEmitter.emit('offline', { reason });
    }

    this.transportUnsubscribe?.();
    this.transportUnsubscribe = null;

    const transport = this.transport;
    this.transport = null;
    this.activeTransportKind = null;

    if (transport) {
      await transport.disconnect().catch(() => {
        return undefined;
      });
    }

    this.yjsController?.handleRoomDisconnected();
    this.peerRegistry.markAllRemotesDisconnected();

    if (!this.shouldAutoReconnect()) {
      this.setStatus('disconnected');
      this.roomEventEmitter.emit('disconnected', { reason });
      return;
    }

    this.startReconnectLoop(reason);
  }

  private setOfflineQueue(nextQueue: OfflineQueueEntry[], notifyStateSubscribers = true): void {
    const previousQueueDepth = this.offlineQueue.length;
    const previousQueuedMutations = this.getQueuedStateMutationCount();
    this.offlineQueue = nextQueue;
    const nextQueueDepth = this.offlineQueue.length;
    const nextQueuedMutations = this.getQueuedStateMutationCount();

    if (previousQueueDepth !== nextQueueDepth) {
      this.logger.info('performance', 'performance', 'Offline queue depth updated', {
        queueDepth: nextQueueDepth,
        queuedMutationCount: nextQueuedMutations,
      });
    }

    if (
      notifyStateSubscribers &&
      previousQueuedMutations !== nextQueuedMutations &&
      this.stateSnapshot
    ) {
      this.notifyStateSubscribers();
    }
  }

  private queueOfflineEventSignal(signal: Extract<RoomTransportSignal, { type: 'event' }>): void {
    this.setOfflineQueue(
      appendOfflineQueueEntry(this.offlineQueue, {
        type: 'event',
        signal,
      }),
    );
    this.scheduleOfflineQueueReplay();
  }

  private cancelOfflineQueueReplay(): void {
    if (this.offlineReplayTimer === null) {
      return;
    }

    globalThis.clearTimeout(this.offlineReplayTimer);
    this.offlineReplayTimer = null;
  }

  private completeOfflineWindowIfReady(): void {
    if (
      !this.offlineWindowActive ||
      !this.transport ||
      this.offlineQueue.length > 0 ||
      this.offlineReplayTimer !== null ||
      this.offlineReplayInProgress
    ) {
      return;
    }

    this.offlineWindowActive = false;
    this.roomEventEmitter.emit('online', undefined);
  }

  private scheduleOfflineQueueReplay(): void {
    if (!this.transport) {
      return;
    }

    if (this.offlineQueue.length === 0) {
      this.completeOfflineWindowIfReady();
      return;
    }

    if (this.offlineReplayInProgress) {
      this.offlineReplayRequested = true;
      return;
    }

    this.cancelOfflineQueueReplay();
    this.offlineReplayTimer = globalThis.setTimeout(() => {
      this.offlineReplayTimer = null;
      void this.flushOfflineQueue();
    }, OFFLINE_QUEUE_REPLAY_SETTLE_MS);
  }

  private async flushOfflineQueue(): Promise<void> {
    if (this.offlineReplayInProgress || !this.transport) {
      return;
    }

    this.offlineReplayInProgress = true;
    let replayedEntries = 0;
    this.logger.info('state', 'state:offline-queue', 'Offline queue replay started', {
      queueDepth: this.offlineQueue.length,
      queuedMutationCount: this.getQueuedStateMutationCount(),
    });

    try {
      while (this.transport && this.offlineQueue.length > 0) {
        const [entry, ...remaining] = this.offlineQueue;
        if (!entry) {
          break;
        }

        if (entry.type === 'event') {
          this.setOfflineQueue(remaining);
          this.dispatchRoomSignal(entry.signal);
          replayedEntries += 1;
          continue;
        }

        this.setOfflineQueue(remaining, false);
        const syncedSnapshot = this.requireSyncedStateSnapshot();
        if (compareStateSnapshots(entry.snapshot, syncedSnapshot) <= 0) {
          this.reconcileQueuedStateSnapshot();
          continue;
        }

        const nextSnapshot = applyOfflineStateMutation(
          syncedSnapshot,
          entry.mutation,
          this.stateInitialValue,
        );

        if (!nextSnapshot) {
          this.reconcileQueuedStateSnapshot();
          continue;
        }

        this.setSyncedStateSnapshot(nextSnapshot);
        this.reconcileQueuedStateSnapshot();
        this.sendStateSnapshot(nextSnapshot);
        replayedEntries += 1;
      }
    } finally {
      this.offlineReplayInProgress = false;
      this.logger.info('state', 'state:offline-queue', 'Offline queue replay finished', {
        queueDepth: this.offlineQueue.length,
        queuedMutationCount: this.getQueuedStateMutationCount(),
        replayedEntries,
      });
      this.logger.info('performance', 'performance', 'Offline queue replay metrics recorded', {
        queueDepth: this.offlineQueue.length,
        queuedMutationCount: this.getQueuedStateMutationCount(),
        replayedEntries,
      });

      if (this.offlineReplayRequested) {
        this.offlineReplayRequested = false;
        this.scheduleOfflineQueueReplay();
        return;
      }

      this.completeOfflineWindowIfReady();
    }
  }

  private createOutboundSignal<
    TSignal extends Omit<RoomTransportSignal, 'roomId' | 'fromPeerId' | 'timestamp'>,
  >(
    signal: TSignal,
    timestamp = Date.now(),
  ): Extract<RoomTransportSignal, { type: TSignal['type'] }> | null {
    return normalizeTransportSignal({
      ...signal,
      roomId: this.id,
      fromPeerId: this.peerId,
      timestamp,
    }) as Extract<RoomTransportSignal, { type: TSignal['type'] }> | null;
  }

  private dispatchRoomSignal(signal: RoomTransportSignal): void {
    if (!this.transport) {
      return;
    }

    this.queueOutboundSignal(signal);
  }

  private sendSignal(
    signal: Omit<RoomTransportSignal, 'roomId' | 'fromPeerId' | 'timestamp'>,
  ): void {
    const outboundSignal = this.createOutboundSignal(signal);
    if (!outboundSignal || !this.transport) {
      return;
    }

    this.dispatchRoomSignal(outboundSignal);
  }

  private sendStateSnapshot(snapshot: StateSnapshot, toPeerId?: string): void {
    this.sendSignal({
      type: 'state:update',
      ...(toPeerId ? { toPeerId } : {}),
      payload: cloneStateSnapshot(snapshot),
    });
  }

  private clearRemoteState(): void {
    this.yjsController?.handleRoomDisconnected();
    this.peerRegistry.clearRemotePeers({
      emitLeaveEvents: false,
    });
    this.cursorPositions.clear();
    this.awarenessByPeer.clear();
    this.awarenessByPeer.set(this.peerId, { peerId: this.peerId });
    this.incompatibleEncryptionPeers.clear();
    this.decryptionErrorPeers.clear();

    this.notifyCursorSubscribers();
    this.notifyAwarenessSubscribers();
  }

  private updateSelfPresence(data: Partial<TPresence>): void {
    const sanitized = sanitizePresencePatch(data);
    this.logger.info('presence', 'presence', 'Local presence updated', {
      keys: Object.keys(sanitized).sort(),
    });
    this.applySelfPresence({
      ...this.selfPeer,
      ...sanitized,
      lastSeen: Date.now(),
    });
  }

  private replaceSelfPresence(data: Partial<TPresence>): void {
    const sanitized = sanitizePresencePatch(data);
    this.logger.info('presence', 'presence', 'Local presence replaced', {
      keys: Object.keys(sanitized).sort(),
    });
    this.applySelfPresence({
      id: this.selfPeer.id,
      joinedAt: this.selfPeer.joinedAt,
      lastSeen: Date.now(),
      ...sanitized,
    });
  }

  private applySelfPresence(next: Peer<TPresence>): void {
    this.peerRegistry.setSelf(next);
    this.yjsController?.syncSelfPeer();
    this.sendSelfPresence();
  }

  private refreshSelfPresenceLastSeen(): void {
    const lastSeen = Date.now();
    this.logger.info('presence', 'presence:heartbeat', 'Presence heartbeat tick', {
      lastSeen,
    });
    this.applySelfPresence({
      ...this.selfPeer,
      lastSeen,
    });
  }

  private sendSelfPresence(toPeerId?: string): void {
    this.sendSignal({
      type: 'presence:update',
      ...(toPeerId ? { toPeerId } : {}),
      payload: { peer: this.selfPeer },
    });
  }

  private configureLwwState<T>(options: StateOptions<T>): void {
    if (this.stateConfigured) {
      return;
    }

    this.stateConfigured = true;
    this.stateStrategy = 'lww';
    this.statePersistenceEnabled = options.persist === true;
    this.stateInitialValue = cloneStateValue(options.initialValue);

    const persistedSnapshot = this.statePersistenceEnabled
      ? this.restorePersistedStateSnapshot()
      : null;
    let shouldBroadcastPersistedSnapshot = false;

    if (!this.stateSnapshot) {
      const initialSnapshot = persistedSnapshot
        ? cloneStateSnapshot(persistedSnapshot)
        : createInitialStateSnapshot(this.stateInitialValue, this.peerId, Date.now());
      this.stateSnapshot = cloneStateSnapshot(initialSnapshot);
      this.syncedStateSnapshot = cloneStateSnapshot(initialSnapshot);
      shouldBroadcastPersistedSnapshot = persistedSnapshot !== null;
    } else if (
      persistedSnapshot &&
      compareStateSnapshots(persistedSnapshot, this.stateSnapshot) > 0
    ) {
      this.stateSnapshot = cloneStateSnapshot(persistedSnapshot);
      this.syncedStateSnapshot = cloneStateSnapshot(persistedSnapshot);
      shouldBroadcastPersistedSnapshot = true;
    }

    if (!this.syncedStateSnapshot && this.stateSnapshot) {
      this.syncedStateSnapshot = cloneStateSnapshot(this.stateSnapshot);
    }

    const configuredSnapshot = this.stateSnapshot;

    if (this.statePersistenceEnabled) {
      this.persistStateSnapshot(configuredSnapshot);
    }

    if (shouldBroadcastPersistedSnapshot && this.currentStatus === 'connected') {
      this.sendStateSnapshot(configuredSnapshot);
    }
  }

  private configureCrdtState<T>(options: StateOptions<T>): void {
    if (this.stateConfigured) {
      return;
    }

    this.stateConfigured = true;
    this.stateStrategy = 'crdt';
    this.stateInitialValue = cloneStateValue(options.initialValue);
  }

  private requireStateSnapshot(): StateSnapshot {
    if (!this.stateSnapshot) {
      throw createFlockError(
        'INVALID_STATE',
        'Shared state has not been configured for this room. Call room.useState(...) first.',
        false,
      );
    }

    return this.stateSnapshot;
  }

  private requireSyncedStateSnapshot(): StateSnapshot {
    if (!this.syncedStateSnapshot) {
      if (!this.stateSnapshot) {
        throw createFlockError(
          'INVALID_STATE',
          'Shared state has not been configured for this room. Call room.useState(...) first.',
          false,
        );
      }

      this.syncedStateSnapshot = cloneStateSnapshot(this.stateSnapshot);
    }

    return this.syncedStateSnapshot;
  }

  private setSyncedStateSnapshot(snapshot: StateSnapshot): void {
    this.syncedStateSnapshot = cloneStateSnapshot(snapshot);
    this.persistStateSnapshot(this.syncedStateSnapshot);
  }

  private setStateSnapshot(
    snapshot: StateSnapshot,
    options: {
      notify?: boolean;
      synced?: boolean;
    } = {},
  ): void {
    this.stateSnapshot = cloneStateSnapshot(snapshot);
    if (options.synced) {
      this.setSyncedStateSnapshot(snapshot);
    }

    if (options.notify !== false) {
      this.notifyStateSubscribers();
    }
  }

  private reconcileQueuedStateSnapshot(): void {
    const syncedSnapshot = this.requireSyncedStateSnapshot();
    const nextSnapshot = projectOfflineStateSnapshot(
      syncedSnapshot,
      this.offlineQueue,
      this.stateInitialValue,
    );
    this.setStateSnapshot(nextSnapshot);
  }

  private restorePersistedStateSnapshot(): StateSnapshot | null {
    const result = readPersistedLwwState(this.id);
    if (result.snapshot) {
      return result.snapshot;
    }

    if (result.error) {
      this.logger.warn('state', 'state:persistence', 'State persistence read failed', {
        key: result.key,
        operation: 'read',
        reason: result.reason ?? 'unknown',
        error: result.error,
      });
    }

    return null;
  }

  private persistStateSnapshot(snapshot: StateSnapshot): void {
    if (!this.statePersistenceEnabled || this.stateStrategy !== 'lww') {
      return;
    }

    const result = writePersistedLwwState(this.id, snapshot);
    if (result.ok || !result.error) {
      return;
    }

    this.logger.warn('state', 'state:persistence', 'State persistence write failed', {
      key: result.key,
      operation: 'write',
      reason: result.reason ?? 'unknown',
      error: result.error,
    });
  }

  private getSelfAndPeersSnapshot(): Peer<TPresence>[] {
    return this.peerRegistry.getAll();
  }

  private async openTransportAttempt(): Promise<TransportAdapter> {
    if (
      this.websocketFallbackTransportPreference === 'polling' &&
      isWebSocketPollingFallbackEnabled(this.options)
    ) {
      this.logger.warn('transport', 'transport:websocket', 'Polling fallback reused', {
        reason: 'sticky-polling-preference',
      });
      return this.openPollingTransportAttempt();
    }

    let transport: TransportAdapter;
    try {
      transport = selectTransportAdapter(this.id, this.peerId, this.options);
    } catch (error) {
      if (this.shouldFallbackToPolling(error)) {
        this.logger.warn('transport', 'transport:websocket', 'Polling fallback selected', {
          reason: 'selection-failed',
        });
        return this.openPollingTransportAttempt();
      }

      throw error;
    }

    try {
      return await this.connectTransportAttempt(transport);
    } catch (error) {
      if (transport.kind === 'websocket' && this.shouldFallbackToPolling(error)) {
        this.logger.warn('transport', 'transport:websocket', 'Polling fallback selected', {
          reason: 'websocket-connect-failed',
        });
        return this.openPollingTransportAttempt();
      }

      throw error;
    }
  }

  private activateConnectedTransport(transport: TransportAdapter): void {
    const connectedAt = Date.now();
    this.transport = transport;
    this.activeTransportKind = transport.kind;
    this.transportUnsubscribe = this.pendingTransportUnsubscribe;
    this.pendingTransportUnsubscribe = null;
    this.websocketFallbackTransportPreference = transport.kind === 'polling' ? 'polling' : null;

    this.registerUnloadHandlers();
    this.hasConnectedBefore = true;
    this.reconnectAttempt = 0;
    this.lastDisconnectReason = null;
    this.latestConnectDurationMs =
      this.connectStartedAt === null ? null : connectedAt - this.connectStartedAt;
    this.connectStartedAt = null;
    this.setStatus('connected');
    this.yjsController?.syncSelfPeer();
    this.yjsController?.handleRoomConnected();
    this.roomEventEmitter.emit('connected', undefined);
    this.notifyPeerSubscribers();
    this.startPresenceHeartbeat();

    this.sendSignal({
      type: 'hello',
      payload: this.createBootstrapPayload(transport.kind),
    });
    this.replayLocalEphemeralState();
    this.scheduleOfflineQueueReplay();
    this.completeOfflineWindowIfReady();

    this.logger.info('transport', 'transport', 'Transport connected', {
      transport: transport.kind,
    });
    if (this.latestConnectDurationMs !== null) {
      this.logger.info('performance', 'performance', 'Connect duration recorded', {
        connectDurationMs: this.latestConnectDurationMs,
        transport: transport.kind,
      });
    }
  }

  private async connectTransportAttempt(transport: TransportAdapter): Promise<TransportAdapter> {
    const unsubscribe = transport.onMessage((signal) => {
      this.enqueueSignal(signal);
    });

    try {
      await transport.connect();
      this.pendingTransportUnsubscribe = unsubscribe;
      return transport;
    } catch (error) {
      unsubscribe();
      await transport.disconnect().catch(() => {
        return undefined;
      });
      throw error;
    }
  }

  private async openPollingTransportAttempt(): Promise<TransportAdapter> {
    return this.connectTransportAttempt(
      createPollingTransportAdapter(this.id, this.peerId, this.options),
    );
  }

  private shouldFallbackToPolling(error: unknown): boolean {
    return (
      isWebSocketPollingFallbackEnabled(this.options) &&
      shouldSelectWebSocketTransport(this.options) &&
      isWebSocketPollingFallbackEligibleError(error)
    );
  }

  private failInitialConnect(error: unknown): never {
    const flockError = toTransportError(error);
    this.connectStartedAt = null;
    this.unregisterUnloadHandlers();
    this.stopPresenceHeartbeat();
    this.clearRemoteState();
    this.pendingTransportUnsubscribe?.();
    this.pendingTransportUnsubscribe = null;
    this.transportUnsubscribe?.();
    this.transportUnsubscribe = null;
    this.transport = null;
    this.activeTransportKind = null;
    this.setStatus('error');
    if (flockError.code === 'ROOM_FULL') {
      this.roomEventEmitter.emit('room:full', undefined);
    }
    this.emitRoomError(flockError);
    throw flockError;
  }

  private shouldAutoReconnect(): boolean {
    return (
      this.reconnectOptions !== null && this.hasConnectedBefore && this.reconnectPromise === null
    );
  }

  private startReconnectLoop(reason: string): void {
    if (this.reconnectPromise) {
      return;
    }

    this.setStatus('reconnecting');
    this.logger.info('transport', 'transport', 'Reconnect loop started', {
      reason,
    });
    const task = this.runReconnectLoop(reason);
    this.reconnectPromise = task;

    void task.then(
      () => {
        if (this.reconnectPromise === task) {
          this.reconnectPromise = null;
        }
      },
      () => {
        if (this.reconnectPromise === task) {
          this.reconnectPromise = null;
        }
      },
    );
  }

  private async runReconnectLoop(reason: string): Promise<void> {
    const reconnectOptions = this.reconnectOptions;
    if (!reconnectOptions) {
      return;
    }

    this.lastDisconnectReason = reason;

    const controller = new AbortController();
    this.reconnectController = controller;
    let lastError: unknown;

    for (let attempt = 1; attempt <= reconnectOptions.maxAttempts; attempt += 1) {
      if (this.wasReconnectAborted(controller)) {
        this.clearReconnectController(controller);
        return;
      }

      this.reconnectAttempt = attempt;
      this.setStatus('reconnecting');
      this.roomEventEmitter.emit('reconnecting', { attempt });

      try {
        const delayMs = computeReconnectDelay(attempt, reconnectOptions, Math.random);
        this.logger.info('performance', 'performance', 'Reconnect attempt scheduled', {
          attempt,
          delayMs,
          reason,
        });
        await delayWithAbort(delayMs, controller.signal);
      } catch (error) {
        if (isAbortError(error)) {
          this.clearReconnectController(controller);
          return;
        }

        throw error;
      }

      if (this.wasReconnectAborted(controller)) {
        this.clearReconnectController(controller);
        return;
      }

      try {
        this.connectStartedAt = Date.now();
        const transport = await this.openTransportAttempt();

        if (this.wasReconnectAborted(controller)) {
          await this.disposeTransportAttempt(transport);
          this.clearReconnectController(controller);
          return;
        }

        this.activateConnectedTransport(transport);
        this.clearReconnectController(controller);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    this.clearReconnectController(controller);
    this.reconnectAttempt = 0;
    this.setStatus('disconnected');
    this.connectStartedAt = null;
    this.logger.error('transport', 'transport', 'Reconnect exhausted', {
      attempts: reconnectOptions.maxAttempts,
      lastDisconnectReason: this.lastDisconnectReason,
      lastError,
    });
    this.emitRoomError(
      createReconnectExhaustedError(
        reconnectOptions.maxAttempts,
        this.lastDisconnectReason,
        lastError,
      ),
    );
    this.roomEventEmitter.emit('disconnected', { reason: 'reconnect-exhausted' });
  }

  private clearReconnectController(controller: AbortController): void {
    if (this.reconnectController === controller) {
      this.reconnectController = null;
    }
  }

  private wasReconnectAborted(controller: AbortController): boolean {
    return controller.signal.aborted;
  }

  private cancelReconnect(): void {
    this.reconnectController?.abort();
    this.reconnectController = null;
  }

  private async disposeTransportAttempt(transport: TransportAdapter): Promise<void> {
    this.pendingTransportUnsubscribe?.();
    this.pendingTransportUnsubscribe = null;
    await transport.disconnect().catch(() => {
      return undefined;
    });
  }

  private replayLocalEphemeralState(): void {
    if (this.stateSnapshot && !hasQueuedStateMutations(this.offlineQueue)) {
      this.sendStateSnapshot(this.stateSnapshot);
    }

    const selfCursor = this.cursorPositions.get(this.peerId);
    if (selfCursor) {
      this.sendSignal({
        type: 'cursor:update',
        payload: {
          cursor: selfCursor,
        },
      });
    }

    const selfAwareness = this.yjsController ? null : this.awarenessByPeer.get(this.peerId);
    if (selfAwareness && this.hasReplayableAwareness(selfAwareness)) {
      this.sendSignal({
        type: 'awareness:update',
        payload: {
          awareness: selfAwareness,
        },
      });
    }
  }

  private startPresenceHeartbeat(): void {
    this.stopPresenceHeartbeat();
    this.presenceHeartbeat = globalThis.setInterval(() => {
      this.refreshSelfPresenceLastSeen();
    }, PRESENCE_HEARTBEAT_MS);
  }

  private stopPresenceHeartbeat(): void {
    if (this.presenceHeartbeat === null) {
      return;
    }

    globalThis.clearInterval(this.presenceHeartbeat);
    this.presenceHeartbeat = null;
  }

  private notifyPeerSubscribers(): void {
    const snapshot = this.getSelfAndPeersSnapshot();
    for (const subscriber of this.peerSubscribers) {
      subscriber(snapshot);
    }
  }

  private handlePeerRegistryJoin(peer: Peer<TPresence>): void {
    this.roomEventEmitter.emit('peer:join', peer);

    if (this.maxPeers !== undefined && this.peerRegistry.getRemoteCount() + 1 >= this.maxPeers) {
      this.roomEventEmitter.emit('room:full', undefined);
    }
  }

  private emitRoomError(error: FlockError): void {
    this.recordDevtoolsError(`${error.code}: ${error.message}`);
    this.logger.error('transport', 'transport', 'Room error emitted', {
      cause: error.cause,
      code: error.code,
      errorMessage: error.message,
      recoverable: error.recoverable,
    });
    this.roomEventEmitter.emit('error', error);
  }

  private handlePeerRegistryUpdate(peer: Peer<TPresence>): void {
    this.roomEventEmitter.emit('peer:update', peer);
  }

  private handlePeerRegistryLeave(peer: Peer<TPresence>): void {
    this.incompatibleEncryptionPeers.delete(peer.id);
    this.decryptionErrorPeers.delete(peer.id);
    this.cursorPositions.delete(peer.id);
    this.awarenessByPeer.delete(peer.id);
    this.yjsController?.handlePeerLeft(peer.id);

    this.roomEventEmitter.emit('peer:leave', peer);

    if (this.peerRegistry.getRemoteCount() === 0) {
      this.roomEventEmitter.emit('room:empty', undefined);
    }

    this.notifyCursorSubscribers();
    this.notifyAwarenessSubscribers();
  }

  private setSelfCursorPosition(position: Partial<CursorPosition>): void {
    const existing = this.cursorPositions.get(this.peerId);
    const next: CursorPosition = {
      userId: this.peerId,
      name: this.getPeerDisplayName(this.selfPeer),
      color: this.getPeerColor(this.selfPeer),
      x: 0,
      y: 0,
      xAbsolute: 0,
      yAbsolute: 0,
      idle: false,
      ...existing,
      ...position,
    };

    this.cursorPositions.set(this.peerId, next);
    this.sendSignal({
      type: 'cursor:update',
      payload: { cursor: next },
    });
    this.notifyCursorSubscribers();
  }

  private notifyCursorSubscribers(): void {
    const positions = Array.from(this.cursorPositions.values());
    for (const subscriber of this.cursorSubscribers) {
      subscriber(positions);
    }
  }

  private notifyStateSubscribers(): void {
    if (!this.stateSnapshot) {
      return;
    }

    for (const subscriber of this.stateSnapshotSubscribers) {
      subscriber(this.stateSnapshot);
    }
  }

  private getAwarenessSnapshot(): AwarenessState[] {
    if (this.yjsController) {
      return this.yjsController.getAllAwareness();
    }

    return Array.from(this.awarenessByPeer.values());
  }

  private getRemoteAwarenessSnapshot(): AwarenessState[] {
    return this.getAwarenessSnapshot().filter((awareness) => {
      return awareness.peerId !== this.peerId;
    });
  }

  private notifyAwarenessSubscribers(): void {
    const snapshot = this.getRemoteAwarenessSnapshot();
    for (const subscriber of this.awarenessSubscribers) {
      subscriber(snapshot);
    }
  }

  private hasReplayableAwareness(awareness: AwarenessState): boolean {
    return Object.keys(awareness).some((key) => key !== 'peerId');
  }

  private emitCustomEvent(name: string, payload: unknown, from: Peer<TPresence>): void {
    const handlers = this.customEventHandlers.get(name);
    if (!handlers || handlers.size === 0) {
      return;
    }

    for (const handler of handlers) {
      handler(payload, from);
    }
  }

  private removeCustomEventHandler(name: string, callback: InternalEventCallback<TPresence>): void {
    const handlers = this.customEventHandlers.get(name);
    if (!handlers) {
      return;
    }

    handlers.delete(callback);
    if (handlers.size === 0) {
      this.customEventHandlers.delete(name);
    }
  }

  private getPeerDisplayName(peer: Peer<TPresence>): string {
    if (typeof peer.name === 'string' && peer.name.trim().length > 0) {
      return peer.name;
    }

    const value = readString(peer, 'name');
    if (value && value.trim().length > 0) {
      return value;
    }

    return peer.id;
  }

  private getPeerColor(peer: Peer<TPresence>): string {
    if (typeof peer.color === 'string' && peer.color.trim().length > 0) {
      return peer.color;
    }

    const value = readString(peer, 'color');
    if (value && value.trim().length > 0) {
      return value;
    }

    return '#4F46E5';
  }
}

/**
 * Creates a realtime room instance.
 *
 * @typeParam TPresence - The custom peer presence shape inferred from `options.presence`.
 * @param roomId - The room identifier to join or create.
 * @param options - Optional room configuration.
 * @returns The created room instance.
 */
export function createRoom<TPresence extends PresenceData = PresenceData>(
  roomId: string,
  options: RoomOptions<TPresence> = {},
): Room<TPresence> {
  return new RoomImpl<TPresence>(roomId, options);
}
