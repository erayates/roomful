import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';

interface TestPresence {
  name: string;
  role?: 'editor' | 'viewer';
  color?: string;
}

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PresenceEngine', () => {
  it('supports update, replace, subscribe, get, getAll, and getSelf with mock transport peers', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-presence', {
      presence: {
        name: 'Alice',
        role: 'editor',
        color: '#111111',
      },
    });
    const roomB = harness.createRoom<TestPresence>('engine-presence', {
      presence: {
        name: 'Bob',
        role: 'viewer',
        color: '#222222',
      },
    });

    const presenceA = roomA.usePresence();
    const presenceB = roomB.usePresence();
    const onPresence = vi.fn();
    const unsubscribe = presenceA.subscribe(onPresence);

    expect(onPresence).toHaveBeenCalledWith([
      expect.objectContaining({
        id: roomA.peerId,
        name: 'Alice',
        role: 'editor',
        color: '#111111',
      }),
    ]);
    expect(presenceA.get('missing-peer')).toBeNull();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => presenceA.get(roomB.peerId)?.name === 'Bob');

    expect(presenceA.getSelf()).toEqual(
      expect.objectContaining({
        id: roomA.peerId,
        name: 'Alice',
        role: 'editor',
        color: '#111111',
      }),
    );
    expect(presenceA.get(roomB.peerId)).toEqual(
      expect.objectContaining({
        id: roomB.peerId,
        name: 'Bob',
        role: 'viewer',
        color: '#222222',
      }),
    );
    expect(presenceA.getAll()).toEqual([
      expect.objectContaining({
        id: roomA.peerId,
        name: 'Alice',
      }),
      expect.objectContaining({
        id: roomB.peerId,
        name: 'Bob',
      }),
    ]);

    presenceA.update({
      color: '#abcdef',
    });
    expect(presenceA.getSelf()).toEqual(
      expect.objectContaining({
        id: roomA.peerId,
        name: 'Alice',
        role: 'editor',
        color: '#abcdef',
      }),
    );

    presenceB.update({
      role: 'editor',
      color: '#999999',
    });
    await harness.waitFor(() => presenceA.get(roomB.peerId)?.role === 'editor');
    expect(presenceA.get(roomB.peerId)).toEqual(
      expect.objectContaining({
        id: roomB.peerId,
        name: 'Bob',
        role: 'editor',
        color: '#999999',
      }),
    );

    presenceB.replace({
      name: 'Bobby',
    });
    await harness.waitFor(() => presenceA.get(roomB.peerId)?.name === 'Bobby');
    expect(presenceA.get(roomB.peerId)).toEqual(
      expect.objectContaining({
        id: roomB.peerId,
        name: 'Bobby',
      }),
    );
    expect(presenceA.get(roomB.peerId)).not.toHaveProperty('role');
    expect(presenceA.get(roomB.peerId)).not.toHaveProperty('color');

    unsubscribe();
    const callCountBeforeLeave = onPresence.mock.calls.length;

    await roomB.disconnect();
    await harness.waitFor(() => presenceA.get(roomB.peerId) === null);

    expect(presenceA.getAll()).toEqual([
      expect.objectContaining({
        id: roomA.peerId,
        name: 'Alice',
        color: '#abcdef',
      }),
    ]);
    expect(onPresence).toHaveBeenCalledTimes(callCountBeforeLeave);
  });
});
