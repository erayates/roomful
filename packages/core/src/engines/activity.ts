import { isObject, readNumber, readString } from '../internal/guards';
import { cloneStateValue } from '../internal/state';
import type { ActivityEngine, ActivityEntry, ActivityOptions, Peer, Unsubscribe } from '../types';

const DEFAULT_LIMIT = 100;

/**
 * The wire shape broadcast for one activity entry. The `actor` is not sent — it is resolved from
 * the broadcasting peer's id on receipt, so entries always carry live presence.
 */
export interface ActivityEntryFrame {
  id: string;
  type: string;
  timestamp: number;
  data?: unknown;
}

/**
 * Wires the activity engine to the room runtime: the local peer id, a peer resolver (so entries
 * carry presence), and the broadcast/receive channel for the reserved activity event.
 */
export interface ActivityEngineContext {
  readonly selfPeerId: string;
  getPeer(peerId: string): Peer | null;
  broadcastEntry(frame: ActivityEntryFrame): void;
  onRemoteEntry(handler: (peerId: string, frame: ActivityEntryFrame) => void): void;
  now?: () => number;
}

/**
 * Parses an inbound activity payload into a typed frame, or `null` when it is malformed, so a
 * malformed remote broadcast can never corrupt the feed.
 *
 * @param payload - The raw event payload.
 * @returns The typed frame, or `null`.
 */
export function parseActivityEntryFrame(payload: unknown): ActivityEntryFrame | null {
  if (!isObject(payload)) {
    return null;
  }

  const id = readString(payload, 'id');
  const type = readString(payload, 'type');
  const timestamp = readNumber(payload, 'timestamp');
  if (id === undefined || type === undefined || timestamp === undefined) {
    return null;
  }

  const frame: ActivityEntryFrame = { id, type, timestamp };
  const data = Reflect.get(payload, 'data');
  if (data !== undefined) {
    frame.data = data;
  }

  return frame;
}

function normalizeLimit(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : DEFAULT_LIMIT;
}

function frameToEntry(frame: ActivityEntryFrame, actor: Peer): ActivityEntry {
  const entry: ActivityEntry = {
    id: frame.id,
    type: frame.type,
    actor,
    timestamp: frame.timestamp,
  };
  if (frame.data !== undefined) {
    entry.data = frame.data;
  }

  return entry;
}

/**
 * Creates an activity engine bound to a room: a shared, bounded, newest-first feed of activity
 * entries. `record` appends locally and broadcasts; entries from peers are appended on receipt.
 * Entries are ordered by timestamp (newest first), de-duplicated by id, and capped at the
 * configured limit (oldest dropped first).
 *
 * @param context - The room runtime bindings.
 * @param createId - Generates ids for new entries.
 * @param options - Optional feed configuration (retention limit).
 * @returns The activity engine bound to the room.
 */
export function createActivityEngine(
  context: ActivityEngineContext,
  createId: () => string,
  options?: ActivityOptions,
): ActivityEngine {
  const now = context.now ?? Date.now;
  const limit = normalizeLimit(options?.limit);
  const entries: ActivityEntry[] = [];
  const seen = new Set<string>();
  const subscribers = new Set<(entries: ActivityEntry[]) => void>();

  const resolveActor = (peerId: string): Peer => {
    return context.getPeer(peerId) ?? { id: peerId, joinedAt: 0, lastSeen: 0 };
  };

  const snapshot = (): ActivityEntry[] => {
    return entries.map((entry) => cloneStateValue(entry));
  };

  const notify = (): void => {
    const current = snapshot();
    for (const subscriber of subscribers) {
      subscriber(current);
    }
  };

  const append = (entry: ActivityEntry): void => {
    if (seen.has(entry.id)) {
      return;
    }

    seen.add(entry.id);
    entries.push(entry);
    // Newest first; a later-arriving older remote entry still lands in the right place.
    entries.sort((left, right) => {
      if (left.timestamp !== right.timestamp) {
        return right.timestamp - left.timestamp;
      }

      return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
    });
    while (entries.length > limit) {
      const dropped = entries.pop();
      if (dropped) {
        seen.delete(dropped.id);
      }
    }

    notify();
  };

  context.onRemoteEntry((peerId, frame) => {
    append(frameToEntry(frame, resolveActor(peerId)));
  });

  return {
    record(type, data): ActivityEntry {
      const frame: ActivityEntryFrame = { id: createId(), type, timestamp: now() };
      if (data !== undefined) {
        frame.data = data;
      }

      const entry = frameToEntry(frame, resolveActor(context.selfPeerId));
      append(entry);
      context.broadcastEntry(frame);
      return cloneStateValue(entry);
    },
    getEntries(): ActivityEntry[] {
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
