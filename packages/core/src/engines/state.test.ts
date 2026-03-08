import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  compareStateSnapshots,
  createInitialStateSnapshot,
  patchStateSnapshot,
  setStateSnapshot,
} from '../internal/state';
import { createStateEngine } from './state';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createStateEngine', () => {
  it('supports get, set, patch, undo, and reset with changedBy metadata', () => {
    let now = 10;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const state = createStateEngine({
      initialValue: {
        count: 0,
        nested: {
          label: 'initial',
          visible: true,
        },
        items: [1],
      },
    });

    const subscriber = vi.fn();
    state.subscribe(subscriber);

    now = 11;
    state.set({
      count: 1,
      nested: {
        label: 'set',
        visible: true,
      },
      items: [1],
    });

    now = 12;
    state.patch({
      nested: {
        label: 'patched',
        visible: true,
      },
      items: [2, 3],
    });

    now = 13;
    state.undo();

    now = 14;
    state.reset();

    expect(state.get()).toEqual({
      count: 0,
      nested: {
        label: 'initial',
        visible: true,
      },
      items: [1],
    });

    expect(subscriber).toHaveBeenNthCalledWith(
      1,
      {
        count: 1,
        nested: {
          label: 'set',
          visible: true,
        },
        items: [1],
      },
      {
        reason: 'set',
        changedBy: 'local',
        timestamp: 11,
      },
    );
    expect(subscriber).toHaveBeenNthCalledWith(
      2,
      {
        count: 1,
        nested: {
          label: 'patched',
          visible: true,
        },
        items: [2, 3],
      },
      {
        reason: 'patch',
        changedBy: 'local',
        timestamp: 12,
      },
    );
    expect(subscriber).toHaveBeenNthCalledWith(
      3,
      {
        count: 1,
        nested: {
          label: 'set',
          visible: true,
        },
        items: [1],
      },
      {
        reason: 'undo',
        changedBy: 'local',
        timestamp: 13,
      },
    );
    expect(subscriber).toHaveBeenNthCalledWith(
      4,
      {
        count: 0,
        nested: {
          label: 'initial',
          visible: true,
        },
        items: [1],
      },
      {
        reason: 'reset',
        changedBy: 'local',
        timestamp: 14,
      },
    );
  });

  it('caps undo history at 20 entries', () => {
    const state = createStateEngine({
      initialValue: {
        count: 0,
      },
    });

    for (let index = 1; index <= 25; index += 1) {
      state.set({
        count: index,
      });
    }

    for (let index = 0; index < 20; index += 1) {
      state.undo();
    }

    expect(state.get()).toEqual({
      count: 5,
    });

    state.undo();
    expect(state.get()).toEqual({
      count: 5,
    });
  });

  it('deep merges plain objects and replaces arrays during patch operations', () => {
    const snapshot = createInitialStateSnapshot(
      {
        count: 1,
        nested: {
          appearance: {
            color: 'blue',
            size: 'm',
          },
        },
        items: [1, 2],
      },
      'peer-a',
      1,
    );

    const nextSnapshot = patchStateSnapshot(
      snapshot,
      {
        nested: {
          appearance: {
            color: 'red',
          },
        },
        items: [3],
      },
      'peer-a',
      2,
    );

    expect(nextSnapshot).not.toBeNull();
    expect(nextSnapshot?.value).toEqual({
      count: 1,
      nested: {
        appearance: {
          color: 'red',
          size: 'm',
        },
      },
      items: [3],
    });
  });

  it('rejects unsupported runtime strategies', () => {
    expect(() => {
      createStateEngine({
        initialValue: {
          count: 0,
        },
        strategy: 'crdt',
      });
    }).toThrowError(/not implemented/i);

    expect(() => {
      createStateEngine({
        initialValue: {
          count: 0,
        },
        strategy: 'custom',
      });
    }).toThrowError(/not implemented/i);
  });

  it('resolves LWW ordering with vector clocks, timestamps, and changedBy tie-breaks', () => {
    const initial = createInitialStateSnapshot(
      {
        count: 0,
      },
      'peer-a',
      1,
    );

    const fromPeerB = setStateSnapshot(
      initial,
      {
        count: 1,
      },
      'peer-b',
      10,
    );
    const fromPeerC = setStateSnapshot(
      initial,
      {
        count: 2,
      },
      'peer-c',
      20,
    );

    expect(compareStateSnapshots(fromPeerC, fromPeerB)).toBeGreaterThan(0);
    expect(compareStateSnapshots(fromPeerB, fromPeerC)).toBeLessThan(0);

    const dominating = setStateSnapshot(
      fromPeerC,
      {
        count: 3,
      },
      'peer-b',
      5,
    );
    expect(compareStateSnapshots(dominating, fromPeerC)).toBeGreaterThan(0);

    const lexicalWinner = {
      ...dominating,
      changedBy: 'peer-z',
    };
    expect(compareStateSnapshots(lexicalWinner, dominating)).toBeGreaterThan(0);
  });

  it('ignores invalid patch payloads, ignores empty undo calls, and stops notifying unsubscribed listeners', () => {
    const state = createStateEngine({
      initialValue: {
        count: 0,
      },
    });

    const subscriber = vi.fn();
    const unsubscribe = state.subscribe(subscriber);

    state.patch([1, 2, 3] as never);
    expect(state.get()).toEqual({
      count: 0,
    });
    expect(subscriber).not.toHaveBeenCalled();

    state.undo();
    expect(state.get()).toEqual({
      count: 0,
    });
    expect(subscriber).not.toHaveBeenCalled();

    unsubscribe();
    state.set({
      count: 1,
    });

    expect(subscriber).not.toHaveBeenCalled();
  });

  it('commits contextual snapshots and forwards runtime updates to subscribers', () => {
    let now = 10;
    let runtimeSubscriber:
      | ((snapshot: ReturnType<typeof createInitialStateSnapshot>) => void)
      | null = null;
    let currentSnapshot = createInitialStateSnapshot(
      {
        count: 1,
        nested: {
          label: 'remote',
          visible: true,
        },
      },
      'peer-b',
      1,
    );

    const commitSnapshot = vi.fn((snapshot: ReturnType<typeof createInitialStateSnapshot>) => {
      currentSnapshot = snapshot;
    });
    const runtimeUnsubscribe = vi.fn();

    const state = createStateEngine(
      {
        initialValue: {
          count: 0,
          nested: {
            label: 'initial',
            visible: false,
          },
        },
      },
      {
        actorId: 'peer-a',
        getInitialValue: () => {
          return {
            count: 99,
            nested: {
              label: 'reset',
              visible: true,
            },
          };
        },
        getValue: () => {
          return currentSnapshot.value as {
            count: number;
            nested: {
              label: string;
              visible: boolean;
            };
          };
        },
        getSnapshot: () => {
          return currentSnapshot;
        },
        subscribeSnapshots: (callback) => {
          runtimeSubscriber = callback;
          return runtimeUnsubscribe;
        },
        commitSnapshot,
        now: () => {
          now += 1;
          return now;
        },
      },
    );

    const subscriber = vi.fn();
    const unsubscribe = state.subscribe(subscriber);

    state.set({
      count: 2,
      nested: {
        label: 'set',
        visible: true,
      },
    });
    expect(commitSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: {
          count: 2,
          nested: {
            label: 'set',
            visible: true,
          },
        },
        changedBy: 'peer-a',
        reason: 'set',
      }),
    );
    runtimeSubscriber?.(currentSnapshot);
    expect(subscriber).toHaveBeenLastCalledWith(
      {
        count: 2,
        nested: {
          label: 'set',
          visible: true,
        },
      },
      {
        reason: 'set',
        changedBy: 'peer-a',
        timestamp: 11,
      },
    );

    currentSnapshot = setStateSnapshot(
      currentSnapshot,
      {
        count: 3,
        nested: {
          label: 'remote-update',
          visible: false,
        },
      },
      'peer-b',
      50,
    );
    runtimeSubscriber?.(currentSnapshot);
    expect(subscriber).toHaveBeenLastCalledWith(
      {
        count: 3,
        nested: {
          label: 'remote-update',
          visible: false,
        },
      },
      {
        reason: 'set',
        changedBy: 'peer-b',
        timestamp: 50,
      },
    );

    state.patch({
      nested: {
        label: 'patched',
      },
    });
    runtimeSubscriber?.(currentSnapshot);
    expect(commitSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: {
          count: 3,
          nested: {
            label: 'patched',
            visible: false,
          },
        },
        changedBy: 'peer-a',
        reason: 'patch',
      }),
    );

    state.undo();
    runtimeSubscriber?.(currentSnapshot);
    expect(commitSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: {
          count: 3,
          nested: {
            label: 'remote-update',
            visible: false,
          },
        },
        changedBy: 'peer-a',
        reason: 'undo',
      }),
    );

    state.reset();
    runtimeSubscriber?.(currentSnapshot);
    expect(commitSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: {
          count: 99,
          nested: {
            label: 'reset',
            visible: true,
          },
        },
        changedBy: 'peer-a',
        reason: 'reset',
      }),
    );
    expect(state.get()).toEqual({
      count: 99,
      nested: {
        label: 'reset',
        visible: true,
      },
    });

    unsubscribe();
    runtimeSubscriber?.(currentSnapshot);
    expect(runtimeUnsubscribe).not.toHaveBeenCalled();
  });
});
