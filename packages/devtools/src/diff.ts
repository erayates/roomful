import type {
  DevtoolsDiffOptions,
  DevtoolsSerializedRecord,
  DevtoolsSerializedValue,
  DevtoolsStateDiffEntry,
} from './types.js';

const DEFAULT_MAX_DIFF_ENTRIES = 50;

function isRecord(value: DevtoolsSerializedValue): value is DevtoolsSerializedRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  if (isRecord(previous) && isRecord(next)) {
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

/**
 * Computes a stable, path-sorted diff between two serialized state snapshots.
 *
 * @param previous - The previous serialized state snapshot.
 * @param next - The next serialized state snapshot.
 * @param options - Optional diff generation limits.
 * @returns The serialized state diff entries.
 */
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
