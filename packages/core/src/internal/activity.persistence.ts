import type { ActivityEntry } from '../types';
import { env } from './env';

/**
 * Local persistence for the Activity feed.
 *
 * Mirrors `comments.persistence.ts`: it reuses the synchronous Web Storage API (keyed
 * `roomful:<roomId>:activity`, versioned) rather than pulling in an IndexedDB wrapper, and fails
 * closed (a read/write error is swallowed so the live feed is never blocked by a storage fault).
 * The public factory in `activity-storage.ts` wraps these in the async `ActivityStorageAdapter`
 * contract.
 */

const ACTIVITY_PERSISTENCE_PREFIX = 'roomful';
const ACTIVITY_PERSISTENCE_KEY = 'activity';
const ACTIVITY_PERSISTENCE_VERSION = 1;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface PersistedActivityEnvelope {
  version: number;
  entries: ActivityEntry[];
}

function getStorage(): StorageLike | null {
  if (!env.hasLocalStorage) {
    return null;
  }

  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createPersistedActivityStorageKey(roomId: string): string {
  return `${ACTIVITY_PERSISTENCE_PREFIX}:${roomId}:${ACTIVITY_PERSISTENCE_KEY}`;
}

/**
 * Reads the persisted entries for a room. Returns an empty list when storage is unavailable, empty,
 * malformed, or version-mismatched. Structural validation of each entry is deferred to the engine,
 * which re-validates (dedupes, sorts, caps) on merge.
 */
export function readPersistedActivity(roomId: string): ActivityEntry[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  let raw: string | null;
  try {
    raw = storage.getItem(createPersistedActivityStorageKey(roomId));
  } catch {
    return [];
  }

  if (raw === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!isRecord(parsed) || parsed.version !== ACTIVITY_PERSISTENCE_VERSION) {
    return [];
  }

  const entries = parsed.entries;
  if (!Array.isArray(entries)) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return entries as ActivityEntry[];
}

/**
 * Persists the full feed for a room. Silently no-ops when storage is unavailable or the write fails.
 */
export function writePersistedActivity(roomId: string, entries: readonly ActivityEntry[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const envelope: PersistedActivityEnvelope = {
    version: ACTIVITY_PERSISTENCE_VERSION,
    entries: entries.map((entry) => entry),
  };

  try {
    storage.setItem(createPersistedActivityStorageKey(roomId), JSON.stringify(envelope));
  } catch {
    // Persistence is best-effort; a quota or access error must not break the live feed.
  }
}
