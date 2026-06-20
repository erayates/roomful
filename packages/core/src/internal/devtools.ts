import type {
  DevtoolsBridge,
  DevtoolsCommandResult,
  DevtoolsEventDirection,
  DevtoolsEventLogEntry,
  DevtoolsPeerSnapshot,
  DevtoolsRoomSnapshot,
  DevtoolsRoomStatus,
  DevtoolsRoomSummary,
  DevtoolsSerializedRecord,
  DevtoolsSerializedScalar,
  DevtoolsSerializedValue,
  DevtoolsStateDiffEntry,
  DevtoolsStateReason,
  DevtoolsStateSnapshot,
  DevtoolsStateStrategy,
  DevtoolsTransportKind,
} from './devtools-contract';

interface DevtoolsSerializationOptions {
  maxArrayLength?: number;
  maxDepth?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
}

interface DevtoolsDiffOptions {
  maxEntries?: number;
}

export const DEVTOOLS_BRIDGE_GLOBAL = '__cahoots_devtools__';
export const DEVTOOLS_BRIDGE_VERSION = 1;
export const DEVTOOLS_MAX_EVENT_LOG_ENTRIES = 100;

const DEFAULT_MAX_DIFF_ENTRIES = 50;

const DEFAULT_SERIALIZATION_OPTIONS: Required<DevtoolsSerializationOptions> = {
  maxArrayLength: 50,
  maxDepth: 6,
  maxObjectKeys: 50,
  maxStringLength: 200,
};

function isSerializedRecordValue(
  value: DevtoolsSerializedValue,
): value is DevtoolsSerializedRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValueEqual(left: DevtoolsSerializedValue, right: DevtoolsSerializedValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildPath(basePath: string, segment: string): string {
  return basePath.length > 0 ? `${basePath}.${segment}` : segment;
}

function visitDifference(
  previous: DevtoolsSerializedValue | undefined,
  next: DevtoolsSerializedValue | undefined,
  path: string,
  entries: DevtoolsStateDiffEntry[],
  maxEntries: number,
): void {
  if (entries.length >= maxEntries) {
    return;
  }

  if (previous === undefined && next !== undefined) {
    entries.push({
      kind: 'added',
      next,
      path,
      previous: null,
    });
    return;
  }

  if (previous !== undefined && next === undefined) {
    entries.push({
      kind: 'removed',
      next: null,
      path,
      previous,
    });
    return;
  }

  if (previous === undefined || next === undefined || isValueEqual(previous, next)) {
    return;
  }

  if (isSerializedRecordValue(previous) && isSerializedRecordValue(next)) {
    const keys = Array.from(new Set([...Object.keys(previous), ...Object.keys(next)])).sort();
    for (const key of keys) {
      visitDifference(previous[key], next[key], buildPath(path, key), entries, maxEntries);
      if (entries.length >= maxEntries) {
        return;
      }
    }
    return;
  }

  entries.push({
    kind: 'changed',
    next,
    path,
    previous,
  });
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const remaining = value.length - maxLength;
  return `${value.slice(0, maxLength)}[Truncated: ${remaining} more characters]`;
}

function readSymbolLabel(value: symbol): string {
  const description = value.description;
  return description && description.length > 0 ? description : '(anonymous)';
}

function readFunctionLabel(value: { readonly name: string }): string {
  return value.name.length > 0 ? value.name : 'anonymous';
}

function serializeArray(
  value: readonly unknown[],
  seen: WeakSet<object>,
  options: Required<DevtoolsSerializationOptions>,
  depth: number,
): DevtoolsSerializedValue[] {
  const next = value.slice(0, options.maxArrayLength).map((entry) => {
    return serializeValue(entry, seen, options, depth + 1);
  });

  if (value.length > options.maxArrayLength) {
    next.push(`[Truncated: ${value.length - options.maxArrayLength} more items]`);
  }

  return next;
}

function serializeObject(
  value: Record<string, unknown>,
  seen: WeakSet<object>,
  options: Required<DevtoolsSerializationOptions>,
  depth: number,
): DevtoolsSerializedRecord {
  const entries = Object.entries(value).sort(([left], [right]) => {
    return left.localeCompare(right);
  });
  const next: DevtoolsSerializedRecord = {};

  for (const [key, entry] of entries.slice(0, options.maxObjectKeys)) {
    next[key] = serializeValue(entry, seen, options, depth + 1);
  }

  if (entries.length > options.maxObjectKeys) {
    next.__truncatedKeys = `[Truncated: ${entries.length - options.maxObjectKeys} more keys]`;
  }

  return next;
}

function serializeBinaryValue(value: ArrayBuffer | ArrayBufferView): DevtoolsSerializedRecord {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

  return {
    __type: value instanceof ArrayBuffer ? 'ArrayBuffer' : value.constructor.name,
    length: bytes.byteLength,
    preview: Array.from(bytes.slice(0, 16)),
  };
}

function serializeError(
  value: Error,
  options: Required<DevtoolsSerializationOptions>,
): DevtoolsSerializedRecord {
  return {
    message: truncateString(value.message, options.maxStringLength),
    name: value.name,
    ...(typeof value.stack === 'string'
      ? {
          stack: truncateString(value.stack, options.maxStringLength),
        }
      : {}),
  };
}

function serializeValue(
  value: unknown,
  seen: WeakSet<object>,
  options: Required<DevtoolsSerializationOptions>,
  depth: number,
): DevtoolsSerializedValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return truncateString(value, options.maxStringLength);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : `[Number ${String(value)}]`;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return '[BigInt]';
  }

  if (typeof value === 'undefined') {
    return '[Undefined]';
  }

  if (typeof value === 'symbol') {
    return `[Symbol ${readSymbolLabel(value)}]`;
  }

  if (typeof value === 'function') {
    return `[Function ${readFunctionLabel(value)}]`;
  }

  if (depth >= options.maxDepth) {
    return '[MaxDepth]';
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '[Invalid Date]' : value.toISOString();
  }

  if (value instanceof Error) {
    return serializeError(value, options);
  }

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return serializeBinaryValue(value);
  }

  if (Array.isArray(value)) {
    return serializeArray(value, seen, options, depth);
  }

  if (isObjectRecord(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    return serializeObject(value, seen, options, depth);
  }

  return `[Unsupported ${typeof value}]`;
}

export function diffSerializedState(
  previous: DevtoolsSerializedValue | null,
  next: DevtoolsSerializedValue | null,
  options: DevtoolsDiffOptions = {},
): DevtoolsStateDiffEntry[] {
  const entries: DevtoolsStateDiffEntry[] = [];
  visitDifference(
    previous ?? undefined,
    next ?? undefined,
    '',
    entries,
    options.maxEntries ?? DEFAULT_MAX_DIFF_ENTRIES,
  );

  return entries
    .filter((entry) => {
      return entry.path.length > 0;
    })
    .sort((left, right) => {
      return left.path.localeCompare(right.path);
    });
}

export function serializeDevtoolsValue(
  value: unknown,
  options: DevtoolsSerializationOptions = {},
): DevtoolsSerializedValue {
  const resolvedOptions = {
    ...DEFAULT_SERIALIZATION_OPTIONS,
    ...options,
  };

  return serializeValue(value, new WeakSet<object>(), resolvedOptions, 0);
}

export type {
  DevtoolsBridge,
  DevtoolsCommandResult,
  DevtoolsEventDirection,
  DevtoolsEventLogEntry,
  DevtoolsPeerSnapshot,
  DevtoolsRoomSnapshot,
  DevtoolsRoomStatus,
  DevtoolsRoomSummary,
  DevtoolsSerializedRecord,
  DevtoolsSerializedScalar,
  DevtoolsSerializedValue,
  DevtoolsStateDiffEntry,
  DevtoolsStateReason,
  DevtoolsStateSnapshot,
  DevtoolsStateStrategy,
  DevtoolsTransportKind,
};
