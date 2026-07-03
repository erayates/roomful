import { readPersistedActivity, writePersistedActivity } from '../internal/activity.persistence';
import { cloneStateValue } from '../internal/state';
import type { ActivityEntry } from '../types';

/**
 * A room-scoped persistence backend for the activity feed.
 *
 * The activity engine calls {@link load} once on startup to restore entries (merged into the live
 * feed), and {@link save} after every change with the full feed (newest first, already capped at
 * the engine's limit). Back it with Postgres, SQLite, Redis, a file, or any durable store — see
 * `docs/reference/activity-storage.md`.
 */
export interface ActivityStorageAdapter {
  /**
   * Returns the persisted entries for the room (empty when there are none).
   *
   * @returns The stored entries.
   */
  load(): Promise<readonly ActivityEntry[]>;

  /**
   * Persists the full feed. Called after every change; an implementation may upsert or diff
   * internally.
   *
   * @param entries - The current feed to persist (newest first).
   * @returns A promise that resolves once the write completes.
   */
  save(entries: readonly ActivityEntry[]): Promise<void>;
}

/**
 * An in-memory {@link ActivityStorageAdapter} — the reference implementation and a test double. Not
 * durable across process restarts; use a real backend in production.
 *
 * @param seed - Entries to preload (defaults to none).
 * @returns A memory-backed storage adapter.
 */
export function createMemoryActivityStorage(
  seed: readonly ActivityEntry[] = [],
): ActivityStorageAdapter {
  let entries: ActivityEntry[] = seed.map((entry) => cloneStateValue(entry));

  return {
    load(): Promise<readonly ActivityEntry[]> {
      return Promise.resolve(entries.map((entry) => cloneStateValue(entry)));
    },
    save(next: readonly ActivityEntry[]): Promise<void> {
      entries = next.map((entry) => cloneStateValue(entry));
      return Promise.resolve();
    },
  };
}

/**
 * A Web Storage–backed {@link ActivityStorageAdapter} for zero-server browser durability — the feed
 * survives a reload without any backend. Keyed per room (`roomful:<roomId>:activity`), versioned,
 * and fails closed: an unavailable or faulting store degrades to an empty/no-op adapter rather than
 * breaking the live feed. Not shared across devices; back the feed with a server adapter for that.
 *
 * @param roomId - The room whose feed is persisted (used as the storage key).
 * @returns A `localStorage`-backed storage adapter.
 */
export function createLocalStorageActivityStorage(roomId: string): ActivityStorageAdapter {
  return {
    load(): Promise<readonly ActivityEntry[]> {
      return Promise.resolve(readPersistedActivity(roomId));
    },
    save(next: readonly ActivityEntry[]): Promise<void> {
      writePersistedActivity(roomId, next);
      return Promise.resolve();
    },
  };
}
