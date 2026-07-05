import type { RoomTransportSignal } from '../transports/transport';
import {
  cloneStateSnapshot,
  cloneStateValue,
  compareStateSnapshots,
  patchStateSnapshot,
  resetStateSnapshot,
  setStateSnapshot,
  type StateChangeReason,
  type StateSnapshot,
  undoStateSnapshot,
} from './state';

export const OFFLINE_EVENT_QUEUE_LIMIT = 100;

type EventSignal = Extract<RoomTransportSignal, { type: 'event' }>;

export type OfflineStateMutation =
  | {
      kind: 'set';
      value: unknown;
      changedBy: string;
      timestamp: number;
    }
  | {
      kind: 'patch';
      partial: unknown;
      changedBy: string;
      timestamp: number;
    }
  | {
      kind: 'undo';
      changedBy: string;
      timestamp: number;
    }
  | {
      kind: 'reset';
      changedBy: string;
      timestamp: number;
    };

export type OfflineQueueEntry =
  | {
      type: 'state';
      mutation: OfflineStateMutation;
      snapshot: StateSnapshot;
    }
  | {
      type: 'event';
      signal: EventSignal;
      /** ponytail: caller-assigned key — skipped on replay if already dispatched this session. */
      idempotencyKey?: string;
    };

function cloneOfflineStateMutation(mutation: OfflineStateMutation): OfflineStateMutation {
  switch (mutation.kind) {
    case 'set':
      return {
        ...mutation,
        value: cloneStateValue(mutation.value),
      };
    case 'patch':
      return {
        ...mutation,
        partial: cloneStateValue(mutation.partial),
      };
    case 'undo':
    case 'reset':
      return {
        ...mutation,
      };
  }
}

function cloneOfflineQueueEntry(entry: OfflineQueueEntry): OfflineQueueEntry {
  if (entry.type === 'state') {
    return {
      type: 'state',
      mutation: cloneOfflineStateMutation(entry.mutation),
      snapshot: cloneStateSnapshot(entry.snapshot),
    };
  }

  return {
    type: 'event',
    signal: cloneStateValue(entry.signal),
    ...(entry.idempotencyKey !== undefined ? { idempotencyKey: entry.idempotencyKey } : {}),
  };
}

function countQueuedEvents(entries: readonly OfflineQueueEntry[]): number {
  return entries.reduce((count, entry) => {
    return entry.type === 'event' ? count + 1 : count;
  }, 0);
}

function trimQueuedEvents(entries: readonly OfflineQueueEntry[]): OfflineQueueEntry[] {
  let remainingEventsToDrop = Math.max(0, countQueuedEvents(entries) - OFFLINE_EVENT_QUEUE_LIMIT);
  if (remainingEventsToDrop === 0) {
    return entries.map(cloneOfflineQueueEntry);
  }

  const trimmed: OfflineQueueEntry[] = [];
  for (const entry of entries) {
    if (entry.type === 'event' && remainingEventsToDrop > 0) {
      remainingEventsToDrop -= 1;
      continue;
    }

    trimmed.push(cloneOfflineQueueEntry(entry));
  }

  return trimmed;
}

export function appendOfflineQueueEntry(
  entries: readonly OfflineQueueEntry[],
  entry: OfflineQueueEntry,
): OfflineQueueEntry[] {
  return trimQueuedEvents([...entries, entry]);
}

export function countQueuedStateMutations(entries: readonly OfflineQueueEntry[]): number {
  return entries.reduce((count, entry) => {
    return entry.type === 'state' ? count + 1 : count;
  }, 0);
}

export function hasQueuedStateMutations(entries: readonly OfflineQueueEntry[]): boolean {
  return entries.some((entry) => {
    return entry.type === 'state';
  });
}

export function createOfflineStateMutation(
  reason: StateChangeReason,
  changedBy: string,
  timestamp: number,
  payload?: unknown,
): OfflineStateMutation {
  switch (reason) {
    case 'set':
      return {
        kind: 'set',
        value: cloneStateValue(payload),
        changedBy,
        timestamp,
      };
    case 'patch':
      return {
        kind: 'patch',
        partial: cloneStateValue(payload),
        changedBy,
        timestamp,
      };
    case 'undo':
      return {
        kind: 'undo',
        changedBy,
        timestamp,
      };
    case 'reset':
      return {
        kind: 'reset',
        changedBy,
        timestamp,
      };
  }
}

export function applyOfflineStateMutation(
  snapshot: StateSnapshot,
  mutation: OfflineStateMutation,
  initialValue: unknown,
): StateSnapshot | null {
  switch (mutation.kind) {
    case 'set':
      return setStateSnapshot(snapshot, mutation.value, mutation.changedBy, mutation.timestamp);
    case 'patch':
      return patchStateSnapshot(snapshot, mutation.partial, mutation.changedBy, mutation.timestamp);
    case 'undo':
      return undoStateSnapshot(snapshot, mutation.changedBy, mutation.timestamp);
    case 'reset':
      return resetStateSnapshot(snapshot, initialValue, mutation.changedBy, mutation.timestamp);
  }
}

export function projectOfflineStateSnapshot(
  baseSnapshot: StateSnapshot,
  entries: readonly OfflineQueueEntry[],
  initialValue: unknown,
): StateSnapshot {
  let projectedSnapshot = cloneStateSnapshot(baseSnapshot);

  for (const entry of entries) {
    if (entry.type !== 'state') {
      continue;
    }

    if (compareStateSnapshots(entry.snapshot, projectedSnapshot) <= 0) {
      continue;
    }

    const nextSnapshot = applyOfflineStateMutation(projectedSnapshot, entry.mutation, initialValue);
    if (!nextSnapshot) {
      continue;
    }

    projectedSnapshot = nextSnapshot;
  }

  return projectedSnapshot;
}
