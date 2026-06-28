import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';
import { createInitialStateSnapshot, setStateSnapshot } from '../internal/state';

interface SharedCounterState {
  count: number;
  nested: {
    label: string;
    visible: boolean;
  };
  items: number[];
}

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('StateEngine with mock transport', () => {
  it('syncs set, patch, late join, undo, and reset across peers', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom('engine-state-sync');
    const roomB = harness.createRoom('engine-state-sync');

    const stateA = roomA.useState<SharedCounterState>({
      initialValue: {
        count: 0,
        nested: {
          label: 'initial',
          visible: true,
        },
        items: [1],
      },
    });
    const stateB = roomB.useState<SharedCounterState>({
      initialValue: {
        count: 99,
        nested: {
          label: 'ignored',
          visible: false,
        },
        items: [],
      },
    });

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    stateA.set({
      count: 1,
      nested: {
        label: 'set',
        visible: true,
      },
      items: [1],
    });
    await harness.waitFor(() => stateB.get().count === 1);

    stateB.patch({
      nested: {
        label: 'patched',
        visible: true,
      },
      items: [2, 3],
    });
    await harness.waitFor(() => stateA.get().nested.label === 'patched');

    const roomC = harness.createRoom('engine-state-sync');
    const stateC = roomC.useState<SharedCounterState>({
      initialValue: {
        count: -1,
        nested: {
          label: 'late',
          visible: false,
        },
        items: [],
      },
    });

    await roomC.connect();
    await harness.waitFor(() => stateC.get().nested.label === 'patched');

    stateC.undo();
    await harness.waitFor(() => {
      return (
        stateA.get().nested.label === 'set' &&
        stateB.get().nested.label === 'set' &&
        stateC.get().nested.label === 'set'
      );
    });

    stateA.reset();
    await harness.waitFor(() => {
      return stateB.get().count === 0 && stateC.get().count === 0;
    });

    expect(stateA.get()).toEqual({
      count: 0,
      nested: {
        label: 'initial',
        visible: true,
      },
      items: [1],
    });
    expect(stateB.get()).toEqual(stateA.get());
    expect(stateC.get()).toEqual(stateA.get());
  });

  it('resolves concurrent ordering and tie-breaks from multiple peers deterministically', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom('engine-state-ordering');
    const stateA = roomA.useState({
      initialValue: {
        count: 0,
      },
    });

    await roomA.connect();

    const initial = createInitialStateSnapshot(
      {
        count: 0,
      },
      roomA.peerId,
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
    const dominating = setStateSnapshot(
      fromPeerC,
      {
        count: 3,
      },
      'peer-b',
      5,
    );

    harness.emit(roomA, {
      type: 'state:update',
      roomId: roomA.id,
      fromPeerId: 'peer-b',
      timestamp: 10,
      payload: fromPeerB,
    });
    harness.emit(roomA, {
      type: 'state:update',
      roomId: roomA.id,
      fromPeerId: 'peer-c',
      timestamp: 20,
      payload: fromPeerC,
    });
    await harness.waitFor(() => stateA.get().count === 2);

    harness.emit(roomA, {
      type: 'state:update',
      roomId: roomA.id,
      fromPeerId: 'peer-b',
      timestamp: 5,
      payload: dominating,
    });
    await harness.waitFor(() => stateA.get().count === 3);

    const roomTie = harness.createRoom('engine-state-ordering-tie');
    const tieState = roomTie.useState({
      initialValue: {
        count: 0,
      },
    });

    await roomTie.connect();

    const tieInitial = createInitialStateSnapshot(
      {
        count: 0,
      },
      roomTie.peerId,
      1,
    );
    const lowerLexical = setStateSnapshot(
      tieInitial,
      {
        count: 4,
      },
      'peer-b',
      30,
    );
    const higherLexical = setStateSnapshot(
      tieInitial,
      {
        count: 5,
      },
      'peer-z',
      30,
    );

    harness.emit(roomTie, {
      type: 'state:update',
      roomId: roomTie.id,
      fromPeerId: 'peer-b',
      timestamp: 30,
      payload: lowerLexical,
    });
    harness.emit(roomTie, {
      type: 'state:update',
      roomId: roomTie.id,
      fromPeerId: 'peer-z',
      timestamp: 30,
      payload: higherLexical,
    });
    await harness.waitFor(() => tieState.get().count === 5);
  });
});

interface CustomMergeState {
  count: number;
  tags: string[];
}

// A commutative + idempotent resolver: field-wise max and a sorted set-union.
// merge(a, b) === merge(b, a) and merge(x, x) === x, which is the contract the
// "custom" strategy needs to converge under concurrent gossip.
function unionMerge(a: CustomMergeState, b: CustomMergeState): CustomMergeState {
  return {
    count: Math.max(a.count, b.count),
    tags: Array.from(new Set([...a.tags, ...b.tags])).sort(),
  };
}

describe('Custom-strategy state with mock transport', () => {
  it('converges concurrent edits across peers via the merge function', async () => {
    harness = await createMockRoomHarness();

    const mergeA = vi.fn(unionMerge);
    const mergeB = vi.fn(unionMerge);

    const roomA = harness.createRoom('custom-state-converge');
    const roomB = harness.createRoom('custom-state-converge');

    const stateA = roomA.useState<CustomMergeState>({
      initialValue: { count: 0, tags: [] },
      strategy: 'custom',
      merge: mergeA,
    });
    const stateB = roomB.useState<CustomMergeState>({
      initialValue: { count: 0, tags: [] },
      strategy: 'custom',
      merge: mergeB,
    });

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    // Concurrent edits: each peer sets before it has seen the other's value.
    stateA.set({ count: 2, tags: ['alpha'] });
    stateB.set({ count: 5, tags: ['beta'] });

    const expected: CustomMergeState = { count: 5, tags: ['alpha', 'beta'] };
    await harness.waitFor(() => {
      return (
        stateA.get().count === 5 &&
        stateA.get().tags.length === 2 &&
        stateB.get().count === 5 &&
        stateB.get().tags.length === 2
      );
    });

    // Both peers resolve to the identical merged value.
    expect(stateA.get()).toEqual(expected);
    expect(stateB.get()).toEqual(expected);

    // merge() ran on the remote-received state on each peer: peer A merged in
    // peer B's {beta} edit, and peer B merged in peer A's {alpha} edit.
    expect(
      mergeA.mock.calls.some(([, remote]) => {
        return remote.tags.includes('beta');
      }),
    ).toBe(true);
    expect(
      mergeB.mock.calls.some(([, remote]) => {
        return remote.tags.includes('alpha');
      }),
    ).toBe(true);
  });

  it('invokes merge on a remote snapshot and notifies subscribers with remote meta', async () => {
    harness = await createMockRoomHarness();

    const merge = vi.fn(unionMerge);
    const room = harness.createRoom('custom-state-remote');
    const state = room.useState<CustomMergeState>({
      initialValue: { count: 1, tags: ['local'] },
      strategy: 'custom',
      merge,
    });

    const subscriber = vi.fn();
    state.subscribe(subscriber);

    await room.connect();

    // A remote peer publishes a concurrent snapshot.
    harness.emit(room, {
      type: 'state:update',
      roomId: room.id,
      fromPeerId: 'peer-remote',
      timestamp: 42,
      payload: setStateSnapshot(
        createInitialStateSnapshot({ count: 1, tags: ['local'] }, 'peer-remote', 1),
        { count: 9, tags: ['remote'] },
        'peer-remote',
        42,
      ),
    });

    await harness.waitFor(() => state.get().count === 9);

    // merge(local, remote) was invoked with the locally-held value and the
    // remote-received value, and the resolved state is the union of both.
    expect(merge).toHaveBeenCalledWith(
      { count: 1, tags: ['local'] },
      { count: 9, tags: ['remote'] },
    );
    expect(state.get()).toEqual({ count: 9, tags: ['local', 'remote'] });

    // Subscribers see the remote origin metadata (changedBy/timestamp/reason),
    // mirroring how the LWW path reports an accepted remote snapshot.
    expect(subscriber).toHaveBeenLastCalledWith(
      { count: 9, tags: ['local', 'remote'] },
      expect.objectContaining({
        changedBy: 'peer-remote',
        timestamp: 42,
        reason: 'set',
      }),
    );
  });
});
