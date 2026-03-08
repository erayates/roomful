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

interface StateEngineContext<T> {
  actorId: string;
  getInitialValue(): T;
  getValue(): T;
  getSnapshot(): StateSnapshot;
  subscribeSnapshots(callback: (snapshot: StateSnapshot) => void): Unsubscribe;
  commitSnapshot(snapshot: StateSnapshot): void;
  now?: () => number;
}

function createMeta(snapshot: StateSnapshot): StateChangeMeta {
  return {
    reason: snapshot.reason,
    changedBy: snapshot.changedBy,
    timestamp: snapshot.timestamp,
  };
}

function trimLocalHistory<T>(history: T[]): T[] {
  if (history.length <= STATE_HISTORY_LIMIT) {
    return history;
  }

  return history.slice(history.length - STATE_HISTORY_LIMIT);
}

function readSnapshotValue<T>(snapshot: StateSnapshot): T {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return snapshot.value as T;
}

export function createStateEngine<T>(
  options: StateOptions<T>,
  context?: StateEngineContext<T>,
): StateEngine<T> {
  assertSupportedStateStrategy(options.strategy);

  const subscribers = new Set<(value: T, meta: StateChangeMeta) => void>();
  const now = context?.now ?? Date.now;
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
    const meta = createMeta(snapshot);
    const nextValue = getValue();

    for (const subscriber of subscribers) {
      subscriber(nextValue, meta);
    }
  };

  const applySnapshot = (snapshot: StateSnapshot): void => {
    if (context) {
      context.commitSnapshot(snapshot);
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

      applySnapshot(setStateSnapshot(getSnapshot(), nextValue, context?.actorId ?? 'local', now()));
    },
    patch(partial) {
      const nextSnapshot = patchStateSnapshot(
        getSnapshot(),
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

      applySnapshot(nextSnapshot);
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

      applySnapshot(nextSnapshot);
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
      );
    },
  };
}
