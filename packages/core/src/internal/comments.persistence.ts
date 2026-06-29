import type { CommentThread } from '../types';
import { env } from './env';

/**
 * Local persistence for the Comments primitive.
 *
 * The `'indexeddb'` storage backend reloads a room's threads on init and
 * rewrites them after every local mutation. To stay within the existing
 * persistence substrate (see `state.persistence.ts`, which uses Web Storage),
 * this reuses the synchronous Storage API rather than pulling in an IndexedDB
 * wrapper: it is keyed identically (`roomful:<roomId>:comments`), versioned,
 * and fails closed (a write/read error is swallowed so collaboration is never
 * blocked by a storage fault). Swapping the Storage calls for an async
 * IndexedDB driver is a follow-up that does not change this module's surface.
 */

const COMMENTS_PERSISTENCE_PREFIX = 'roomful';
const COMMENTS_PERSISTENCE_KEY = 'comments';
const COMMENTS_PERSISTENCE_VERSION = 1;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface PersistedCommentsEnvelope {
  version: number;
  threads: CommentThread[];
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

export function createPersistedCommentsStorageKey(roomId: string): string {
  return `${COMMENTS_PERSISTENCE_PREFIX}:${roomId}:${COMMENTS_PERSISTENCE_KEY}`;
}

/**
 * Reads the persisted threads for a room. Returns an empty list when storage is
 * unavailable, empty, malformed, or version-mismatched. Structural validation
 * of each thread is deferred to the engine, which re-validates on load.
 */
export function readPersistedComments(roomId: string): CommentThread[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  let raw: string | null;
  try {
    raw = storage.getItem(createPersistedCommentsStorageKey(roomId));
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

  if (!isRecord(parsed) || parsed.version !== COMMENTS_PERSISTENCE_VERSION) {
    return [];
  }

  const threads = parsed.threads;
  if (!Array.isArray(threads)) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return threads as CommentThread[];
}

/**
 * Persists the full thread list for a room. Silently no-ops when storage is
 * unavailable or the write fails.
 */
export function writePersistedComments(roomId: string, threads: CommentThread[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const envelope: PersistedCommentsEnvelope = {
    version: COMMENTS_PERSISTENCE_VERSION,
    threads,
  };

  try {
    storage.setItem(createPersistedCommentsStorageKey(roomId), JSON.stringify(envelope));
  } catch {
    // Persistence is best-effort; a quota or access error must not break sync.
  }
}
