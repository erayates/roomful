import { readPersistedComments, writePersistedComments } from '../internal/comments.persistence';
import { cloneStateValue } from '../internal/state';
import type { CommentThread } from '../types';

/**
 * A room-scoped persistence backend for comment threads.
 *
 * The comments engine calls {@link load} once on startup to restore threads into an empty room, and
 * {@link save} after every change with the full thread list. Back it with Postgres, SQLite, Redis,
 * a file, or any durable store — see `docs/reference/comments-storage.md`.
 */
export interface CommentsStorageAdapter {
  /**
   * Returns the persisted threads for the room (empty when there are none).
   *
   * @returns The stored threads.
   */
  load(): Promise<readonly CommentThread[]>;

  /**
   * Persists the full thread list. Called after every mutation; an implementation may upsert or
   * diff internally.
   *
   * @param threads - The current threads to persist.
   * @returns A promise that resolves once the write completes.
   */
  save(threads: readonly CommentThread[]): Promise<void>;
}

/**
 * An in-memory {@link CommentsStorageAdapter} — the reference implementation and a test double. Not
 * durable across process restarts; use a real backend in production.
 *
 * @param seed - Threads to preload (defaults to none).
 * @returns A memory-backed storage adapter.
 */
export function createMemoryCommentsStorage(
  seed: readonly CommentThread[] = [],
): CommentsStorageAdapter {
  let threads: CommentThread[] = seed.map((thread) => cloneStateValue(thread));

  return {
    load(): Promise<readonly CommentThread[]> {
      return Promise.resolve(threads.map((thread) => cloneStateValue(thread)));
    },
    save(next: readonly CommentThread[]): Promise<void> {
      threads = next.map((thread) => cloneStateValue(thread));
      return Promise.resolve();
    },
  };
}

/**
 * A Web Storage–backed {@link CommentsStorageAdapter} for zero-server browser durability — comment
 * threads (with their replies and resolved state) survive a reload with no backend. Keyed per room
 * (`roomful:<roomId>:comments`), versioned, and fails closed. This is the adapter that backs the
 * `storage: 'indexeddb'` option, so it hydrates full threads through the engine's own restore path.
 *
 * @param roomId - The room whose threads are persisted (used as the storage key).
 * @returns A `localStorage`-backed storage adapter.
 */
export function createLocalStorageCommentsStorage(roomId: string): CommentsStorageAdapter {
  return {
    load(): Promise<readonly CommentThread[]> {
      return Promise.resolve(readPersistedComments(roomId));
    },
    save(next: readonly CommentThread[]): Promise<void> {
      writePersistedComments(roomId, [...next]);
      return Promise.resolve();
    },
  };
}
