import type {
  DevtoolsRoomStatus,
  DevtoolsSerializedRecord,
  DevtoolsSerializedValue,
  DevtoolsTransportKind,
} from '../types';

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function isObject(value: DevtoolsSerializedValue): value is DevtoolsSerializedRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatTimestamp(timestamp: number | null): string {
  if (timestamp === null) {
    return 'n/a';
  }

  return timeFormatter.format(new Date(timestamp));
}

export function formatStatus(status: DevtoolsRoomStatus): string {
  return status.replace(/-/g, ' ');
}

export function formatTransport(transport: DevtoolsTransportKind): string {
  return transport ?? 'n/a';
}

export function formatSerializedValue(
  value: DevtoolsSerializedValue | null,
  maxLength = 120,
): string {
  if (value === null) {
    return 'null';
  }

  const serialized = JSON.stringify(value);
  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, Math.max(0, maxLength - 1))}\u2026`;
}

export function formatDiffPath(path: string): string {
  return path.length > 0 ? path : 'root';
}

export function getPeerLabel(value: DevtoolsSerializedRecord | null, fallbackId: string): string {
  if (!value) {
    return fallbackId;
  }

  const name = value.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return name;
  }

  const id = value.id;
  if (typeof id === 'string' && id.trim().length > 0) {
    return id;
  }

  return fallbackId;
}

export function getSortedRecordEntries(
  value: DevtoolsSerializedRecord | null,
): Array<readonly [string, DevtoolsSerializedValue]> {
  if (!value || !isObject(value)) {
    return [];
  }

  return Object.entries(value).sort(([left], [right]) => {
    return left.localeCompare(right);
  });
}

export function toTestIdSegment(path: string): string {
  if (path.length === 0) {
    return 'root';
  }

  return path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root';
}
