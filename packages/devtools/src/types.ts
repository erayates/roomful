/**
 * Represents the connection lifecycle of a room as shown in devtools.
 */
export type DevtoolsRoomStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

/**
 * Represents the active transport shown in devtools.
 */
export type DevtoolsTransportKind =
  | 'broadcast'
  | 'in-memory'
  | 'webrtc'
  | 'websocket'
  | 'polling'
  | null;

/**
 * Represents the active shared-state strategy shown in devtools.
 */
export type DevtoolsStateStrategy = 'lww' | 'crdt' | 'custom' | null;

/**
 * Represents the latest shared-state mutation reason shown in devtools.
 */
export type DevtoolsStateReason = 'set' | 'patch' | 'undo' | 'reset' | null;

/**
 * Represents the direction of a devtools event log entry.
 */
export type DevtoolsEventDirection = 'incoming' | 'outgoing' | 'system';

/**
 * Represents the type of a serialized state diff entry.
 */
export type DevtoolsDiffKind = 'added' | 'removed' | 'changed';

/**
 * Represents primitive values preserved by devtools serialization.
 */
export type DevtoolsSerializedScalar = boolean | number | string | null;

/**
 * Represents any serialized value supported by devtools snapshots.
 */
export type DevtoolsSerializedValue =
  | DevtoolsSerializedScalar
  | DevtoolsSerializedValue[]
  | DevtoolsSerializedRecord;

/**
 * Represents a serialized object shown in devtools snapshots.
 */
export interface DevtoolsSerializedRecord {
  /**
   * Stores serialized values by object key.
   */
  [key: string]: DevtoolsSerializedValue;
}

/**
 * Represents a single state diff entry shown in devtools.
 */
export interface DevtoolsStateDiffEntry {
  /**
   * Describes the diff category.
   */
  kind: DevtoolsDiffKind;

  /**
   * Stores the next value, or `null` when the key was removed.
   */
  next: DevtoolsSerializedValue | null;

  /**
   * Stores the dotted path for the changed key.
   */
  path: string;

  /**
   * Stores the previous value, or `null` when the key was added.
   */
  previous: DevtoolsSerializedValue | null;
}

/**
 * Represents a peer snapshot shown in devtools.
 */
export interface DevtoolsPeerSnapshot {
  /**
   * Identifies the peer.
   */
  id: string;

  /**
   * Indicates whether the snapshot is for the local peer.
   */
  isSelf: boolean;

  /**
   * Indicates whether the peer was injected by devtools.
   */
  isSimulated: boolean;

  /**
   * Records when the peer joined the room.
   */
  joinedAt: number;

  /**
   * Records the last time the peer was observed.
   */
  lastSeen: number;

  /**
   * Stores the serialized presence payload.
   */
  presence: DevtoolsSerializedRecord;
}

/**
 * Represents an event log entry shown in devtools.
 */
export interface DevtoolsEventLogEntry {
  /**
   * Describes whether the event was incoming, outgoing, or system-generated.
   */
  direction: DevtoolsEventDirection;

  /**
   * Identifies the sending peer when available.
   */
  fromPeerId: string | null;

  /**
   * Identifies the log entry.
   */
  id: string;

  /**
   * Stores the custom event name.
   */
  name: string;

  /**
   * Stores the serialized event payload.
   */
  payload: DevtoolsSerializedValue;

  /**
   * Stores the serialized sender snapshot when available.
   */
  sender: DevtoolsSerializedRecord | null;

  /**
   * Records when the event was logged.
   */
  timestamp: number;

  /**
   * Identifies the target peer for directed events when available.
   */
  toPeerId: string | null;
}

/**
 * Represents the shared-state snapshot shown in devtools.
 */
export interface DevtoolsStateSnapshot {
  /**
   * Indicates whether shared state has been configured.
   */
  available: boolean;

  /**
   * Stores the diff from the previous snapshot.
   */
  diff: DevtoolsStateDiffEntry[];

  /**
   * Identifies the peer that last changed the state when available.
   */
  lastChangedBy: string | null;

  /**
   * Records when the state last changed when available.
   */
  lastUpdatedAt: number | null;

  /**
   * Indicates whether local changes are still pending sync.
   */
  pending: boolean;

  /**
   * Counts queued offline mutations.
   */
  queuedMutationCount: number;

  /**
   * Stores the latest state mutation reason.
   */
  reason: DevtoolsStateReason;

  /**
   * Stores the active state strategy.
   */
  strategy: DevtoolsStateStrategy;

  /**
   * Stores the serialized shared-state value.
   */
  value: DevtoolsSerializedValue | null;
}

/**
 * Represents the lightweight room summary shown in devtools room lists.
 */
export interface DevtoolsRoomSummary {
  /**
   * Indicates whether the room currently has a simulated peer.
   */
  hasSimulatedPeer: boolean;

  /**
   * Indicates whether the room has shared state configured.
   */
  hasState: boolean;

  /**
   * Identifies the room instance registration.
   */
  instanceId: string;

  /**
   * Counts currently known peers.
   */
  peerCount: number;

  /**
   * Identifies the local peer.
   */
  peerId: string;

  /**
   * Identifies the room.
   */
  roomId: string;

  /**
   * Stores the current room connection status.
   */
  status: DevtoolsRoomStatus;

  /**
   * Stores the active transport.
   */
  transport: DevtoolsTransportKind;
}

/**
 * Represents the full room snapshot shown in devtools.
 */
export interface DevtoolsRoomSnapshot extends DevtoolsRoomSummary {
  /**
   * Stores the devtools bridge protocol version.
   */
  bridgeVersion: number;

  /**
   * Stores recent room errors.
   */
  errors: string[];

  /**
   * Stores recent custom event log entries.
   */
  events: DevtoolsEventLogEntry[];

  /**
   * Stores peer snapshots.
   */
  peers: DevtoolsPeerSnapshot[];

  /**
   * Stores the shared-state snapshot.
   */
  state: DevtoolsStateSnapshot;
}

/**
 * Represents the result of a devtools bridge command.
 */
export interface DevtoolsCommandResult {
  /**
   * Stores an error message when the command fails.
   */
  error?: string;

  /**
   * Indicates whether the command succeeded.
   */
  ok: boolean;
}

/**
 * Exposes the devtools bridge available to browser extensions and overlays.
 */
export interface DevtoolsBridge {
  /**
   * Disconnects an injected simulated peer.
   *
   * @param instanceId - The room instance to target.
   * @returns The command result.
   */
  disconnectSimulatedPeer(instanceId: string): DevtoolsCommandResult;

  /**
   * Reads the latest room snapshot for an instance.
   *
   * @param instanceId - The room instance to target.
   * @returns The room snapshot, or `null` when unavailable.
   */
  getSnapshot(instanceId: string): DevtoolsRoomSnapshot | null;

  /**
   * Injects a simulated peer into a room instance.
   *
   * @param instanceId - The room instance to target.
   * @returns The command result.
   */
  injectSimulatedPeer(instanceId: string): DevtoolsCommandResult;

  /**
   * Lists registered room summaries.
   *
   * @returns The registered room summaries.
   */
  listRooms(): DevtoolsRoomSummary[];

  /**
   * Stores the bridge protocol version.
   */
  version: number;
}

/**
 * Configures value serialization limits for devtools snapshots.
 */
export interface DevtoolsSerializationOptions {
  /**
   * Caps the number of array items preserved per array.
   */
  maxArrayLength?: number;

  /**
   * Caps the recursion depth preserved during serialization.
   */
  maxDepth?: number;

  /**
   * Caps the number of object keys preserved per object.
   */
  maxObjectKeys?: number;

  /**
   * Caps the number of characters preserved per string.
   */
  maxStringLength?: number;
}

/**
 * Configures serialized state diff generation.
 */
export interface DevtoolsDiffOptions {
  /**
   * Caps the number of diff entries produced.
   */
  maxEntries?: number;
}
