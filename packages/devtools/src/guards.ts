import { DEVTOOLS_BRIDGE_VERSION } from './constants.js';
import type {
  DevtoolsEventLogEntry,
  DevtoolsPeerSnapshot,
  DevtoolsRoomSnapshot,
  DevtoolsRoomStatus,
  DevtoolsRoomSummary,
  DevtoolsSerializedRecord,
  DevtoolsSerializedValue,
  DevtoolsStateDiffEntry,
  DevtoolsStateReason,
  DevtoolsStateSnapshot,
  DevtoolsStateStrategy,
  DevtoolsTransportKind,
} from './types.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSerializedValue(value: unknown): value is DevtoolsSerializedValue {
  if (value === null) {
    return true;
  }

  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => {
      return isSerializedValue(entry);
    });
  }

  if (!isObject(value)) {
    return false;
  }

  return Object.values(value).every((entry) => {
    return isSerializedValue(entry);
  });
}

function isRoomStatus(value: unknown): value is DevtoolsRoomStatus {
  return (
    value === 'idle' ||
    value === 'connecting' ||
    value === 'connected' ||
    value === 'reconnecting' ||
    value === 'disconnected' ||
    value === 'error'
  );
}

function isTransportKind(value: unknown): value is DevtoolsTransportKind {
  return (
    value === null ||
    value === 'broadcast' ||
    value === 'in-memory' ||
    value === 'webrtc' ||
    value === 'websocket' ||
    value === 'polling'
  );
}

function isStateStrategy(value: unknown): value is DevtoolsStateStrategy {
  return value === null || value === 'lww' || value === 'crdt' || value === 'custom';
}

function isStateReason(value: unknown): value is DevtoolsStateReason {
  return (
    value === null || value === 'set' || value === 'patch' || value === 'undo' || value === 'reset'
  );
}

function isSerializedRecord(value: unknown): value is DevtoolsSerializedRecord {
  return isObject(value) && isSerializedValue(value);
}

function isStateDiffEntry(value: unknown): value is DevtoolsStateDiffEntry {
  return (
    isObject(value) &&
    (value.kind === 'added' || value.kind === 'removed' || value.kind === 'changed') &&
    isString(value.path) &&
    (value.previous === null || isSerializedValue(value.previous)) &&
    (value.next === null || isSerializedValue(value.next))
  );
}

function isPeerSnapshot(value: unknown): value is DevtoolsPeerSnapshot {
  return (
    isObject(value) &&
    isString(value.id) &&
    isBoolean(value.isSelf) &&
    isBoolean(value.isSimulated) &&
    isFiniteNumber(value.joinedAt) &&
    isFiniteNumber(value.lastSeen) &&
    isSerializedRecord(value.presence)
  );
}

function isEventLogEntry(value: unknown): value is DevtoolsEventLogEntry {
  return (
    isObject(value) &&
    (value.direction === 'incoming' ||
      value.direction === 'outgoing' ||
      value.direction === 'system') &&
    isString(value.id) &&
    isString(value.name) &&
    isFiniteNumber(value.timestamp) &&
    (value.fromPeerId === null || isString(value.fromPeerId)) &&
    (value.toPeerId === null || isString(value.toPeerId)) &&
    isSerializedValue(value.payload) &&
    (value.sender === null || isSerializedRecord(value.sender))
  );
}

function isStateSnapshot(value: unknown): value is DevtoolsStateSnapshot {
  return (
    isObject(value) &&
    isBoolean(value.available) &&
    Array.isArray(value.diff) &&
    value.diff.every((entry) => {
      return isStateDiffEntry(entry);
    }) &&
    (value.lastChangedBy === null || isString(value.lastChangedBy)) &&
    (value.lastUpdatedAt === null || isFiniteNumber(value.lastUpdatedAt)) &&
    isBoolean(value.pending) &&
    isFiniteNumber(value.queuedMutationCount) &&
    isStateReason(value.reason) &&
    isStateStrategy(value.strategy) &&
    (value.value === null || isSerializedValue(value.value))
  );
}

/**
 * Checks whether a value matches the public devtools room summary shape.
 *
 * @param value - The unknown value to validate.
 * @returns `true` when the value is a `DevtoolsRoomSummary`.
 */
export function isDevtoolsRoomSummary(value: unknown): value is DevtoolsRoomSummary {
  return (
    isObject(value) &&
    isBoolean(value.hasSimulatedPeer) &&
    isBoolean(value.hasState) &&
    isString(value.instanceId) &&
    isFiniteNumber(value.peerCount) &&
    isString(value.peerId) &&
    isString(value.roomId) &&
    isRoomStatus(value.status) &&
    isTransportKind(value.transport)
  );
}

/**
 * Checks whether a value matches the public devtools room snapshot shape.
 *
 * @param value - The unknown value to validate.
 * @returns `true` when the value is a `DevtoolsRoomSnapshot`.
 */
export function isDevtoolsRoomSnapshot(value: unknown): value is DevtoolsRoomSnapshot {
  if (!isDevtoolsRoomSummary(value)) {
    return false;
  }

  const bridgeVersion: unknown = Reflect.get(value, 'bridgeVersion');
  const errors: unknown = Reflect.get(value, 'errors');
  const events: unknown = Reflect.get(value, 'events');
  const peers: unknown = Reflect.get(value, 'peers');
  const state: unknown = Reflect.get(value, 'state');
  return (
    bridgeVersion === DEVTOOLS_BRIDGE_VERSION &&
    Array.isArray(errors) &&
    errors.every((entry: unknown) => {
      return isString(entry);
    }) &&
    Array.isArray(events) &&
    events.every((entry: unknown) => {
      return isEventLogEntry(entry);
    }) &&
    Array.isArray(peers) &&
    peers.every((entry: unknown) => {
      return isPeerSnapshot(entry);
    }) &&
    isStateSnapshot(state)
  );
}
