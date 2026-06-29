import * as Y from 'yjs';

import { cloneStateValue } from '../internal/state';
import type { HistoryEngine, HistoryOptions, Peer, TimelineEntry, Unsubscribe } from '../types';

/**
 * The root `Y.Array` the History primitive owns inside the room's shared Yjs
 * document. Like the comments root (`__roomful_comments__`), it is deliberately
 * distinct from the shared-state root (`__roomful__`) so the timeline never
 * collides with a user's `useState`/`useSharedState`, while still riding the
 * existing `crdt:sync` transport and reaching late joiners through the sync
 * handshake.
 */
export const CRDT_HISTORY_ROOT_NAME = '__roomful_history__';

/**
 * The default per-peer cap on retained timeline entries (and the local
 * undo-stack bound).
 */
export const DEFAULT_HISTORY_MAX_ENTRIES = 100;

/**
 * The default debounce window, in milliseconds, that merges rapid captures into
 * a single undoable stack item.
 */
export const DEFAULT_HISTORY_CAPTURE_INTERVAL_MS = 500;

/**
 * Wires the history engine to the room runtime. The room supplies the shared
 * Yjs document (so undo/redo and the timeline ride the existing CRDT sync), the
 * local peer id used as the transaction origin, and a resolver for the local
 * self peer used to stamp `peerName` onto timeline entries.
 *
 * The model and its honest limits
 * --------------------------------
 * - **Per-peer undo via `Y.UndoManager`.** A `Y.UndoManager` is created on the
 *   room's shared document and scoped to a single local origin instance
 *   ({@link HistoryEngineContext}'s synthetic origin). Yjs's UndoManager only
 *   captures and reverts transactions whose origin is in its `trackedOrigins`
 *   set, so `undo()`/`redo()` revert ONLY the local peer's changes to the
 *   shared CRDT state — conflict-free, never touching another peer's
 *   concurrent edits. This origin-scoped reversal IS the collaborative "undo
 *   tree": remote peers commit under their own origins and are invisible to
 *   this manager.
 * - **What is undoable.** `transaction(name, fn)` runs `fn` inside a tracked
 *   `doc.transact` so every shared-CRDT mutation it makes (the data behind
 *   `useState({ strategy: 'crdt' })`) is captured as ONE stack item. Undo/redo
 *   operate on that shared `Y.Doc` only. App-local React/component state and
 *   the `'lww'` state strategy are NOT auto-reverted — reverting those is the
 *   app's responsibility. A bare `capture()` records a timeline entry
 *   (metadata) and is undoable only when paired with `transaction()`
 *   mutations.
 * - **Shared timeline.** A dedicated `Y.Array` root holds every peer's
 *   {@link TimelineEntry}. It converges across peers exactly like comments'
 *   thread map; entries are re-validated at read time so a malformed remote
 *   write can never crash a reader.
 */
export interface HistoryEngineContext {
  /**
   * The local peer id, stamped on timeline entries and used to derive the
   * tracked transaction origin.
   */
  actorId: string;

  /**
   * The room's shared Yjs document. The timeline lives in a dedicated root
   * array on this same doc, and the UndoManager tracks the doc's shared-state
   * root, so both ride the existing `crdt:sync` channel.
   */
  doc: Y.Doc;

  /**
   * Resolves the local self peer whose name is recorded on entries this peer
   * captures.
   */
  getSelfPeer(): Peer;

  /**
   * Overrides the clock used for entry timestamps. Defaults to `Date.now`.
   */
  now?: () => number;
}

/**
 * A synthetic transaction origin that tags the local peer's tracked history
 * mutations. A fresh instance per engine guarantees the UndoManager scopes to
 * THIS peer only: no other origin (local CRDT-state writes, remote sync) is
 * tracked, so undo/redo cannot revert another peer's work.
 */
class HistoryTransactionOrigin {
  public constructor(public readonly actorId: string) {}
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
 * Reads a stored timeline value into a typed {@link TimelineEntry}, dropping any
 * structurally-invalid entry so a malformed remote write can never crash a
 * reader (mirrors how the comments engine re-validates remote threads).
 */
function readTimelineEntry(value: unknown): TimelineEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value, 'id');
  const peerId = readString(value, 'peerId');
  const action = readString(value, 'action');
  const timestamp = readFiniteNumber(value, 'timestamp');
  if (id === null || peerId === null || action === null || timestamp === null) {
    return null;
  }

  const peerName = readString(value, 'peerName');
  const description = readString(value, 'description');

  return {
    id,
    peerId,
    peerName: peerName ?? peerId,
    action,
    timestamp,
    description: description ?? action,
  };
}

/**
 * Resolves the display name to stamp on an entry from the self peer, falling
 * back to the peer id so an entry always carries a usable `peerName`.
 */
function resolvePeerName(peer: Peer): string {
  return typeof peer.name === 'string' && peer.name.length > 0 ? peer.name : peer.id;
}

/**
 * Derives an entry description from the optional `capture`/`transaction`
 * payload: a string payload is used verbatim, anything else falls back to the
 * action label.
 */
function resolveDescription(action: string, payload: unknown): string {
  return typeof payload === 'string' && payload.length > 0 ? payload : action;
}

/**
 * Creates a history engine bound to a room. Undo/redo run through a
 * {@link Y.UndoManager} scoped to the local peer's transaction origin, and the
 * shared timeline lives in a dedicated `Y.Array` on the room's shared document.
 * See {@link HistoryEngineContext} for the full model and its limits.
 *
 * @param context - The room runtime bindings (shared doc, actor id, self peer).
 * @param createId - Generates ids for new timeline entries.
 * @param options - Optional history configuration (caps and debounce).
 * @returns The history engine bound to the room.
 */
export function createHistoryEngine(
  context: HistoryEngineContext,
  createId: () => string,
  options: HistoryOptions = {},
): HistoryEngine {
  const now = context.now ?? Date.now;
  const maxEntries =
    typeof options.maxEntries === 'number' && Number.isFinite(options.maxEntries)
      ? Math.max(1, Math.floor(options.maxEntries))
      : DEFAULT_HISTORY_MAX_ENTRIES;
  const captureTimeout =
    typeof options.captureInterval === 'number' && Number.isFinite(options.captureInterval)
      ? Math.max(0, options.captureInterval)
      : DEFAULT_HISTORY_CAPTURE_INTERVAL_MS;

  const subscribers = new Set<(timeline: TimelineEntry[]) => void>();

  // The shared timeline: a dedicated root array on the room's doc, synced to
  // every peer over the existing CRDT channel.
  const timelineRoot = context.doc.getArray<unknown>(CRDT_HISTORY_ROOT_NAME);

  // The local peer's tracked origin. Only transactions committed under this
  // exact instance enter the UndoManager's stacks, which is what makes
  // undo/redo per-peer and conflict-free.
  const origin = new HistoryTransactionOrigin(context.actorId);

  // Scope the UndoManager to the WHOLE shared document, so a `transaction()`
  // captures every CRDT mutation the app makes to it — the data behind
  // `useState({ strategy: 'crdt' })` plus any other shared root the app writes.
  // Yjs treats the doc itself as a wildcard scope (it matches every changed
  // type), so this is the most faithful "history of the shared doc" model.
  //
  // Capture is gated by BOTH scope AND tracked origin: only transactions whose
  // origin is our local `origin` instance enter the stacks. The timeline append
  // rides an untracked (null-origin) transaction, so even though the timeline
  // root lives on this same in-scope doc, recording a log line is never itself
  // undoable — and remote peers' transactions (their own origins) are ignored,
  // which is what makes undo/redo per-peer and conflict-free.
  const undoManager = new Y.UndoManager(context.doc, {
    captureTimeout,
    trackedOrigins: new Set<unknown>([origin]),
  });

  const snapshot = (): TimelineEntry[] => {
    const entries: TimelineEntry[] = [];
    for (const value of timelineRoot.toArray()) {
      const entry = readTimelineEntry(value);
      if (entry) {
        entries.push(entry);
      }
    }

    // Chronological order, oldest entry first. The sort is stable (ES2019+), so
    // same-timestamp entries keep their underlying Y.Array order — and Yjs
    // converges that array order identically on every peer, giving a
    // deterministic, insertion-preserving timeline without a synthetic
    // tie-breaker.
    entries.sort((left, right) => {
      return left.timestamp - right.timestamp;
    });

    return entries;
  };

  const notify = (): void => {
    const entries = snapshot();
    for (const subscriber of subscribers) {
      subscriber(entries.map((entry) => cloneStateValue(entry)));
    }
  };

  // A single deep observation drives timeline notifications whether the change
  // is local or arrived over CRDT sync from a peer.
  timelineRoot.observeDeep(() => {
    notify();
  });

  // canUndo/canRedo can change without a timeline change (an undo pops the
  // local stack but appends nothing), so the manager's stack events also fan
  // out to subscribers.
  undoManager.on('stack-item-added', () => {
    notify();
  });
  undoManager.on('stack-item-popped', () => {
    notify();
  });

  // Keeps the per-peer timeline bounded: drop the oldest entries this peer
  // owns once it exceeds maxEntries. Other peers' entries are left untouched.
  const trimOwnEntries = (): void => {
    const ownIndices: number[] = [];
    const stored = timelineRoot.toArray();
    for (let index = 0; index < stored.length; index += 1) {
      const entry = readTimelineEntry(stored[index]);
      if (entry && entry.peerId === context.actorId) {
        ownIndices.push(index);
      }
    }

    const overflow = ownIndices.length - maxEntries;
    if (overflow <= 0) {
      return;
    }

    // Delete oldest-first (lowest indices). Splicing one at a time keeps the
    // shifting indices correct without recomputing the whole list.
    for (let removed = 0; removed < overflow; removed += 1) {
      const targetIndex = ownIndices[removed];
      if (typeof targetIndex === 'number') {
        timelineRoot.delete(targetIndex - removed, 1);
      }
    }
  };

  const appendTimelineEntry = (action: string, payload: unknown): void => {
    const selfPeer = context.getSelfPeer();
    const entry: TimelineEntry = {
      id: createId(),
      peerId: context.actorId,
      peerName: resolvePeerName(selfPeer),
      action,
      timestamp: now(),
      description: resolveDescription(action, payload),
    };

    // The timeline append rides its own (untracked) transaction so it is never
    // captured by the UndoManager — undoing a drawing must not also "undo" the
    // log line that recorded it.
    context.doc.transact(() => {
      timelineRoot.push([entry]);
      trimOwnEntries();
    });
  };

  return {
    capture(action, payload) {
      appendTimelineEntry(action, payload);
    },
    transaction(name, fn) {
      // Run the caller's mutations under the tracked origin so the UndoManager
      // captures them as one stack item. captureTimeout coalesces calls made
      // within the debounce window into a single undoable unit.
      context.doc.transact(() => {
        fn();
      }, origin);

      // Bound the local undo stack to maxEntries (oldest dropped first),
      // mirroring the per-peer timeline cap.
      if (undoManager.undoStack.length > maxEntries) {
        undoManager.undoStack.splice(0, undoManager.undoStack.length - maxEntries);
      }

      appendTimelineEntry(name, undefined);
    },
    async undo() {
      undoManager.undo();
    },
    async redo() {
      undoManager.redo();
    },
    canUndo() {
      return undoManager.undoStack.length > 0;
    },
    canRedo() {
      return undoManager.redoStack.length > 0;
    },
    timeline() {
      return snapshot();
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
