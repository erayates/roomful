import type {
  DevtoolsSerializationOptions,
  DevtoolsSerializedRecord,
  DevtoolsSerializedValue,
} from './types.js';

const DEFAULT_SERIALIZATION_OPTIONS: Required<DevtoolsSerializationOptions> = {
  maxArrayLength: 50,
  maxDepth: 6,
  maxObjectKeys: 50,
  maxStringLength: 200,
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

/**
 * Serializes an arbitrary runtime value into a devtools-safe snapshot shape.
 *
 * @param value - The runtime value to serialize.
 * @param options - Optional serialization limits.
 * @returns The serialized devtools value.
 */
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
