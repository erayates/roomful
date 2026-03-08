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
