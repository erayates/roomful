export declare const DEVTOOLS_BRIDGE_GLOBAL: string;
export declare const DEVTOOLS_BRIDGE_VERSION: number;
export declare const DEVTOOLS_MAX_EVENT_LOG_ENTRIES: number;

export type DevtoolsRoomStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type DevtoolsTransportKind =
  | 'broadcast'
  | 'in-memory'
  | 'webrtc'
  | 'websocket'
  | 'webtransport'
  | 'polling'
  | null;

export type DevtoolsStateStrategy = 'lww' | 'crdt' | 'custom' | null;
export type DevtoolsStateReason = 'set' | 'patch' | 'undo' | 'reset' | null;
export type DevtoolsEventDirection = 'incoming' | 'outgoing' | 'system';
export type DevtoolsDiffKind = 'added' | 'removed' | 'changed';

export type DevtoolsSerializedScalar = boolean | number | string | null;
export type DevtoolsSerializedValue =
  | DevtoolsSerializedScalar
  | DevtoolsSerializedValue[]
  | DevtoolsSerializedRecord;

export interface DevtoolsSerializedRecord {
  [key: string]: DevtoolsSerializedValue;
}

export interface DevtoolsStateDiffEntry {
  kind: DevtoolsDiffKind;
  next: DevtoolsSerializedValue | null;
  path: string;
  previous: DevtoolsSerializedValue | null;
}

export interface DevtoolsPeerSnapshot {
  id: string;
  isSelf: boolean;
  isSimulated: boolean;
  joinedAt: number;
  lastSeen: number;
  presence: DevtoolsSerializedRecord;
}

export interface DevtoolsEventLogEntry {
  direction: DevtoolsEventDirection;
  fromPeerId: string | null;
  id: string;
  name: string;
  payload: DevtoolsSerializedValue;
  sender: DevtoolsSerializedRecord | null;
  timestamp: number;
  toPeerId: string | null;
}

export interface DevtoolsStateSnapshot {
  available: boolean;
  diff: DevtoolsStateDiffEntry[];
  lastChangedBy: string | null;
  lastUpdatedAt: number | null;
  pending: boolean;
  queuedMutationCount: number;
  reason: DevtoolsStateReason;
  strategy: DevtoolsStateStrategy;
  value: DevtoolsSerializedValue | null;
}

export interface DevtoolsRoomSummary {
  hasSimulatedPeer: boolean;
  hasState: boolean;
  instanceId: string;
  peerCount: number;
  peerId: string;
  roomId: string;
  status: DevtoolsRoomStatus;
  transport: DevtoolsTransportKind;
}

export interface DevtoolsRoomSnapshot extends DevtoolsRoomSummary {
  bridgeVersion: number;
  errors: string[];
  events: DevtoolsEventLogEntry[];
  peers: DevtoolsPeerSnapshot[];
  state: DevtoolsStateSnapshot;
}

export interface DevtoolsCommandResult {
  error?: string;
  ok: boolean;
}

export interface DevtoolsBridge {
  disconnectSimulatedPeer(instanceId: string): DevtoolsCommandResult;
  getSnapshot(instanceId: string): DevtoolsRoomSnapshot | null;
  injectSimulatedPeer(instanceId: string): DevtoolsCommandResult;
  listRooms(): DevtoolsRoomSummary[];
  version: number;
}

export declare function diffSerializedState(
  previous: DevtoolsSerializedValue,
  next: DevtoolsSerializedValue,
): DevtoolsStateDiffEntry[];

export declare function serializeDevtoolsValue(value: unknown): DevtoolsSerializedValue;
