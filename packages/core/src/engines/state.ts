import { createFlockError } from '../flock-error';
import {
  assertSupportedStateStrategy,
  cloneStateValue,
  createInitialStateSnapshot,
  patchStateSnapshot,
  resetStateSnapshot,
  setStateSnapshot,
  STATE_HISTORY_LIMIT,
  type StateSnapshot,
  undoStateSnapshot,
} from '../internal/state';
import type { StateChangeMeta, StateEngine, StateOptions, Unsubscribe } from '../types';

type StateEngineMutation<T> =
  | {
      reason: 'set';
      payload: T;
    }
  | {
      reason: 'patch';
      payload: Partial<T>;
    }
  | {
      reason: 'undo';
    }
  | {
      reason: 'reset';
    };

interface StateEngineCommit<T> {
  mutation: StateEngineMutation<T>;
  snapshot: StateSnapshot;
}

interface StateEngineContext<T> {
  actorId: string;
  getInitialValue(): T;
  getValue(): T;
  getSnapshot(): StateSnapshot;
  subscribeSnapshots(callback: (snapshot: StateSnapshot) => void): Unsubscribe;
  commitChange(change: StateEngineCommit<T>): void;
  getSyncMeta?(): Pick<StateChangeMeta, 'pending' | 'queuedMutationCount'>;
  now?: () => number;
}

function createMeta(
  snapshot: StateSnapshot,
  syncMeta?: Pick<StateChangeMeta, 'pending' | 'queuedMutationCount'>,
): StateChangeMeta {
  return {
    reason: snapshot.reason,
    changedBy: snapshot.changedBy,
    timestamp: snapshot.timestamp,
    pending: syncMeta?.pending ?? false,
    queuedMutationCount: syncMeta?.queuedMutationCount ?? 0,
  };
}

function trimLocalHistory<T>(history: T[]): T[] {
  if (history.length <= STATE_HISTORY_LIMIT) {
    return history;
  }

  return history.slice(history.length - STATE_HISTORY_LIMIT);
}

function readSnapshotValue<T>(snapshot: StateSnapshot): T {
  // The snapshot stores a generically-typed value that the caller knows is T.
  // This is the same pattern as typed-peer.ts: the internal snapshot is the
  // single source of truth and the generic parameter flows from the caller.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return snapshot.value as T;
}

export function createStateEngine<T>(
  options: StateOptions<T>,
  context?: StateEngineContext<T>,
): StateEngine<T> {
  assertSupportedStateStrategy(options.strategy);

  if (options.strategy === 'custom' && typeof options.merge !== 'function') {
    throw createFlockError(
      'INVALID_STATE',
      'State strategy "custom" requires a "merge" function. Provide a merge(a, b) => T function in StateOptions.',
      false,
      { strategy: 'custom' },
    );
  }

  const resolveMerger = (): ((local: T, remote: Partial<T>) => T) | null => {
    if (options.strategy !== 'custom' || typeof options.merge !== 'function') {
      return null;
    }

    const mergeFn = options.merge;
    return (local: T, remote: Partial<T>): T => {
      // Partial<T> is T with optional keys; merge function expects the full shape.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return mergeFn(local, remote as T);
    };
  };

  const customMerger = resolveMerger();

  const subscribers = new Set<(value: T, meta: StateChangeMeta) => void>();
  const now = (): number => {
    return context?.now?.() ?? Date.now();
  };
  let localValue = cloneStateValue(options.initialValue);
  let localHistory: T[] = [];
  let localSnapshot = createInitialStateSnapshot(options.initialValue, 'local', 0);

  if (!context) {
    localSnapshot = createInitialStateSnapshot(options.initialValue, 'local', now());
  }

  const getSnapshot = (): StateSnapshot => {
    return context ? context.getSnapshot() : localSnapshot;
  };

  const getValue = (): T => {
    return context ? cloneStateValue(context.getValue()) : cloneStateValue(localValue);
  };

  const notify = (snapshot: StateSnapshot): void => {
    const meta = createMeta(snapshot, context?.getSyncMeta?.());
    const nextValue = getValue();

    for (const subscriber of subscribers) {
      subscriber(nextValue, meta);
    }
  };

  const applySnapshot = (snapshot: StateSnapshot, mutation: StateEngineMutation<T>): void => {
    if (context) {
      context.commitChange({
        mutation,
        snapshot,
      });
      return;
    }

    localSnapshot = snapshot;
    notify(snapshot);
  };

  const runtimeSubscription = context?.subscribeSnapshots((snapshot) => {
    notify(snapshot);
  });
  void runtimeSubscription;

  return {
    get() {
      return getValue();
    },
    set(nextValue) {
      if (!context) {
        localHistory = trimLocalHistory([...localHistory, cloneStateValue(localValue)]);
        localValue = cloneStateValue(nextValue);
      }

      applySnapshot(
        setStateSnapshot(getSnapshot(), nextValue, context?.actorId ?? 'local', now()),
        {
          reason: 'set',
          payload: cloneStateValue(nextValue),
        },
      );
    },
    patch(partial) {
      const currentSnapshot = getSnapshot();
      if (customMerger) {
        const current = readSnapshotValue<T>(currentSnapshot);
        const merged = customMerger(cloneStateValue(current), partial);
        if (!context) {
          localHistory = trimLocalHistory([...localHistory, cloneStateValue(localValue)]);
          localValue = cloneStateValue(merged);
        }

        applySnapshot(
          setStateSnapshot(currentSnapshot, merged, context?.actorId ?? 'local', now()),
          {
            reason: 'patch',
            payload: cloneStateValue(partial),
          },
        );
        return;
      }

      const nextSnapshot = patchStateSnapshot(
        currentSnapshot,
        partial,
        context?.actorId ?? 'local',
        now(),
      );
      if (!nextSnapshot) {
        return;
      }

      if (!context) {
        localHistory = trimLocalHistory([...localHistory, cloneStateValue(localValue)]);
        localValue = cloneStateValue(readSnapshotValue<T>(nextSnapshot));
      }

      applySnapshot(nextSnapshot, {
        reason: 'patch',
        payload: cloneStateValue(partial),
      });
    },
    subscribe(cb) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    undo() {
      const nextSnapshot = undoStateSnapshot(getSnapshot(), context?.actorId ?? 'local', now());
      if (!nextSnapshot) {
        return;
      }

      if (!context) {
        localHistory = localHistory.slice(0, -1);
        localValue = cloneStateValue(readSnapshotValue<T>(nextSnapshot));
      }

      applySnapshot(nextSnapshot, {
        reason: 'undo',
      });
    },
    reset() {
      if (!context) {
        localHistory = [];
        localValue = cloneStateValue(options.initialValue);
      }

      applySnapshot(
        resetStateSnapshot(
          getSnapshot(),
          context ? context.getInitialValue() : options.initialValue,
          context?.actorId ?? 'local',
          now(),
        ),
        {
          reason: 'reset',
        },
      );
    },
  };
}
