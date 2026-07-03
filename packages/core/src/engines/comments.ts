import * as Y from 'yjs';

import { cloneStateValue } from '../internal/state';
import { createRoomfulError } from '../roomful-error';
import type {
  Comment,
  CommentAnchor,
  CommentsEngine,
  CommentsOptions,
  CommentThread,
  Peer,
  Unsubscribe,
} from '../types';
import { LocalCrdtTransactionOrigin } from '../yjs/origin';
import type { CommentsStorageAdapter } from './comments-storage';

/**
 * The root Y.Map name the Comments primitive owns inside the room's shared
 * Yjs document. It is deliberately distinct from the shared-state root
 * (`__roomful__`) so threads never collide with a user's `useState`/
 * `useSharedState`, while still riding the existing `crdt:sync` transport.
 */
export const CRDT_COMMENTS_ROOT_NAME = '__roomful_comments__';

/**
 * The key under {@link CRDT_COMMENTS_ROOT_NAME} that holds the thread map
 * (`threadId -> serialized CommentThread`).
 */
export const CRDT_COMMENTS_THREADS_KEY = 'threads';

/**
 * The transport/persistence backend a comments engine runs on.
 *
 * - `'memory'` is the synced, in-room collaborative structure (fully
 *   implemented).
 * - `'indexeddb'` adds local persistence on top of the synced structure.
 * - `'rest'` adds a REST mirror on top of the synced structure.
 */
export type CommentsStorage = NonNullable<CommentsOptions['storage']>;

/**
 * Wires the comments engine to the room runtime. The room supplies the shared
 * Yjs document (so threads ride the existing CRDT sync), the local actor id,
 * and a resolver for the local self peer used as the comment author.
 */
export interface CommentsEngineContext {
  /**
   * The local peer id, stamped as the CRDT transaction actor.
   */
  actorId: string;

  /**
   * The room's shared Yjs document. Comments live in a dedicated root map on
   * this same doc, so they sync over the existing `crdt:sync` channel.
   */
  doc: Y.Doc;

  /**
   * Resolves the local self peer recorded as the author of new comments and
   * replies.
   */
  getSelfPeer(): Peer;

  /**
   * Overrides the clock used for `createdAt` timestamps. Defaults to
   * `Date.now`.
   */
  now?: () => number;

  /**
   * Optional persistence sink invoked after every local mutation with the full
   * thread list. Used by the `'indexeddb'` and `'rest'` backends.
   */
  onLocalMutation?(threads: CommentThread[]): void;

  /**
   * Optional durable storage. When set, threads are restored from it on startup
   * (into an empty room) and saved to it after every change, so comments survive
   * reconnects and reloads. See {@link CommentsStorageAdapter}.
   */
  storage?: CommentsStorageAdapter;
}

interface SerializedComment {
  id: string;
  author: Peer;
  text: string;
  createdAt: number;
}

interface SerializedThread {
  id: string;
  anchor: CommentAnchor;
  author: Peer;
  text: string;
  createdAt: number;
  resolved: boolean;
  replies: SerializedComment[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Normalizes an untyped author payload into a {@link Peer}. The id is required;
 * the optional descriptive fields are copied through when present, and any
 * extra presence keys are preserved so the author round-trips faithfully.
 */
function readPeer(value: unknown): Peer | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value, 'id');
  if (id === null) {
    return null;
  }

  const peer: Peer = {
    ...value,
    id,
    joinedAt: readFiniteNumber(value, 'joinedAt') ?? 0,
    lastSeen: readFiniteNumber(value, 'lastSeen') ?? 0,
  };

  return cloneStateValue(peer);
}

/**
 * Validates a raw anchor into the {@link CommentAnchor} union. Order matters:
 * a text-range anchor is a superset of an element anchor, so the range shape is
 * checked first.
 */
function readAnchor(value: unknown): CommentAnchor | null {
  if (!isRecord(value)) {
    return null;
  }

  const from = readFiniteNumber(value, 'from');
  const to = readFiniteNumber(value, 'to');
  const elementId = readString(value, 'elementId');

  if (from !== null && to !== null && elementId !== null) {
    return { from, to, elementId };
  }

  if (elementId !== null) {
    return { elementId };
  }

  const recordId = readString(value, 'recordId');
  const fieldId = readString(value, 'fieldId');
  if (recordId !== null && fieldId !== null) {
    return { recordId, fieldId };
  }

  if (recordId !== null) {
    return { recordId };
  }

  if (fieldId !== null) {
    return { fieldId };
  }

  const nodeId = readString(value, 'nodeId');
  if (nodeId !== null) {
    return { nodeId };
  }

  const x = readFiniteNumber(value, 'x');
  const y = readFiniteNumber(value, 'y');
  if (x !== null && y !== null) {
    return { x, y };
  }

  return null;
}

function readComment(value: unknown): Comment | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value, 'id');
  const author = readPeer(value.author);
  const text = readString(value, 'text');
  const createdAt = readFiniteNumber(value, 'createdAt');
  if (id === null || author === null || text === null || createdAt === null) {
    return null;
  }

  return { id, author, text, createdAt };
}

/**
 * Reads a stored thread map into a typed {@link CommentThread}, dropping any
 * structurally-invalid entry so a malformed remote write can never crash a
 * reader.
 */
function readThread(value: unknown): CommentThread | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value, 'id');
  const anchor = readAnchor(value.anchor);
  const author = readPeer(value.author);
  const text = readString(value, 'text');
  const createdAt = readFiniteNumber(value, 'createdAt');
  if (id === null || anchor === null || author === null || text === null || createdAt === null) {
    return null;
  }

  const repliesValue = value.replies;
  const replies: Comment[] = [];
  if (Array.isArray(repliesValue)) {
    for (const entry of repliesValue) {
      const reply = readComment(entry);
      if (reply) {
        replies.push(reply);
      }
    }
  }

  return {
    id,
    anchor,
    author,
    text,
    createdAt,
    resolved: value.resolved === true,
    replies,
  };
}

function anchorElementId(anchor: CommentAnchor): string | null {
  if ('elementId' in anchor) {
    return anchor.elementId;
  }

  return null;
}

/**
 * Converts a public {@link CommentThread} into the stored map shape, used to seed threads loaded
 * from a {@link CommentsStorageAdapter} back into the shared document.
 */
function toSerializedThread(thread: CommentThread): SerializedThread {
  return {
    id: thread.id,
    anchor: thread.anchor,
    author: thread.author,
    text: thread.text,
    createdAt: thread.createdAt,
    resolved: thread.resolved,
    replies: thread.replies.map((reply) => ({
      id: reply.id,
      author: reply.author,
      text: reply.text,
      createdAt: reply.createdAt,
    })),
  };
}

/**
 * Creates a comments engine bound to a room. Threads are held in a dedicated
 * `Y.Map` on the room's shared document, so every `add`/`reply`/`resolve`/
 * `reopen` is a CRDT mutation that converges across peers and reaches late
 * joiners through the existing sync handshake — no relay change, no collision
 * with user shared-state.
 *
 * @param context - The room runtime bindings (shared doc, actor id, self peer).
 * @param createId - Generates ids for new threads and replies.
 * @returns The comments engine bound to the room.
 */
export function createCommentsEngine(
  context: CommentsEngineContext,
  createId: () => string,
): CommentsEngine {
  const now = context.now ?? Date.now;
  const subscribers = new Set<(threads: CommentThread[]) => void>();

  const root = context.doc.getMap(CRDT_COMMENTS_ROOT_NAME);

  const getThreadsMap = (): Y.Map<unknown> => {
    let threadsMap = root.get(CRDT_COMMENTS_THREADS_KEY);
    if (!(threadsMap instanceof Y.Map)) {
      threadsMap = new Y.Map<unknown>();
      root.set(CRDT_COMMENTS_THREADS_KEY, threadsMap);
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return threadsMap as Y.Map<unknown>;
  };

  const readThreadsMapValue = (): Y.Map<unknown> | null => {
    const threadsMap = root.get(CRDT_COMMENTS_THREADS_KEY);
    return threadsMap instanceof Y.Map ? threadsMap : null;
  };

  const snapshot = (): CommentThread[] => {
    const threadsMap = readThreadsMapValue();
    if (!threadsMap) {
      return [];
    }

    const threads: CommentThread[] = [];
    for (const value of threadsMap.values()) {
      const thread = readThread(value instanceof Y.Map ? value.toJSON() : value);
      if (thread) {
        threads.push(thread);
      }
    }

    // Stable, deterministic order: oldest thread first, ties broken by id.
    threads.sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
      }

      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });

    return threads;
  };

  const notify = (): void => {
    const threads = snapshot();
    context.onLocalMutation?.(threads);
    if (context.storage) {
      void context.storage.save(threads).catch(() => {
        // Persistence is best-effort: a failed save never breaks the live, synced comments.
      });
    }
    for (const subscriber of subscribers) {
      subscriber(threads.map((thread) => cloneStateValue(thread)));
    }
  };

  // A single deep observation drives every subscriber notification, whether the
  // change originated locally or arrived over the CRDT sync channel from a peer.
  root.observeDeep(() => {
    notify();
  });

  const transact = (mutate: (threadsMap: Y.Map<unknown>) => void): void => {
    const meta = {
      reason: 'set' as const,
      changedBy: context.actorId,
      timestamp: now(),
      pending: false,
      queuedMutationCount: 0,
    };

    context.doc.transact(() => {
      mutate(getThreadsMap());
    }, new LocalCrdtTransactionOrigin(meta));
  };

  const writeThread = (threadsMap: Y.Map<unknown>, thread: SerializedThread): void => {
    threadsMap.set(thread.id, cloneStateValue(thread));
  };

  const readSerializedThread = (
    threadsMap: Y.Map<unknown>,
    id: string,
  ): SerializedThread | null => {
    const value = threadsMap.get(id);
    const resolved = value instanceof Y.Map ? value.toJSON() : value;
    const thread = readThread(resolved);
    if (!thread) {
      return null;
    }

    return {
      id: thread.id,
      anchor: thread.anchor,
      author: thread.author,
      text: thread.text,
      createdAt: thread.createdAt,
      resolved: thread.resolved,
      replies: thread.replies.map((reply) => ({
        id: reply.id,
        author: reply.author,
        text: reply.text,
        createdAt: reply.createdAt,
      })),
    };
  };

  const requireThread = (id: string): CommentThread => {
    const threadsMap = readThreadsMapValue();
    const thread = threadsMap ? readThread(threadsMap.get(id)) : null;
    if (!thread) {
      throw createRoomfulError(
        'INVALID_STATE',
        `Comment thread "${id}" was not found. It may have never existed or has not yet synced.`,
        false,
        { threadId: id },
      );
    }

    return cloneStateValue(thread);
  };

  const add = async (input: { anchor: CommentAnchor; text: string }): Promise<CommentThread> => {
    const anchor = readAnchor(input.anchor);
    if (!anchor) {
      throw createRoomfulError(
        'INVALID_STATE',
        'Comment anchor must be { elementId }, { x, y }, { from, to, elementId }, ' +
          '{ recordId }, { recordId, fieldId }, { fieldId }, or { nodeId }.',
        false,
        { anchor: input.anchor },
      );
    }

    const thread: SerializedThread = {
      id: createId(),
      anchor,
      author: cloneStateValue(context.getSelfPeer()),
      text: input.text,
      createdAt: now(),
      resolved: false,
      replies: [],
    };

    transact((threadsMap) => {
      writeThread(threadsMap, thread);
    });

    return requireThread(thread.id);
  };

  const reply = async (threadId: string, text: string): Promise<CommentThread> => {
    const comment: SerializedComment = {
      id: createId(),
      author: cloneStateValue(context.getSelfPeer()),
      text,
      createdAt: now(),
    };

    transact((threadsMap) => {
      const current = readSerializedThread(threadsMap, threadId);
      if (!current) {
        return;
      }

      writeThread(threadsMap, {
        ...current,
        replies: [...current.replies, comment],
      });
    });

    return requireThread(threadId);
  };

  const setResolved = async (threadId: string, resolved: boolean): Promise<CommentThread> => {
    transact((threadsMap) => {
      const current = readSerializedThread(threadsMap, threadId);
      if (!current || current.resolved === resolved) {
        return;
      }

      writeThread(threadsMap, {
        ...current,
        resolved,
      });
    });

    return requireThread(threadId);
  };

  // Restore persisted threads on startup, but only into an empty room — if threads already exist
  // (seeded locally or synced from a peer), the live CRDT is the source of truth and is left alone.
  const hydrate = async (): Promise<void> => {
    const storage = context.storage;
    if (!storage) {
      return;
    }

    const stored = await storage.load();
    if (stored.length === 0 || snapshot().length > 0) {
      return;
    }

    transact((threadsMap) => {
      for (const thread of stored) {
        writeThread(threadsMap, toSerializedThread(thread));
      }
    });
  };

  void hydrate().catch(() => {
    // Persistence is best-effort: a failed restore leaves live comments working normally.
  });

  return {
    add,
    thread(id) {
      return {
        reply: (text) => reply(id, text),
        resolve: () => setResolved(id, true),
        reopen: () => setResolved(id, false),
      };
    },
    getAll() {
      return snapshot();
    },
    getByElement(elementId) {
      return snapshot().filter((thread) => {
        return anchorElementId(thread.anchor) === elementId;
      });
    },
    getOpen() {
      return snapshot().filter((thread) => {
        return !thread.resolved;
      });
    },
    subscribe(callback): Unsubscribe {
      subscribers.add(callback);
      callback(snapshot());
      return () => {
        subscribers.delete(callback);
      };
    },
  };
}
