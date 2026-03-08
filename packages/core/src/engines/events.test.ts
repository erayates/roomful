import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';

interface TestPresence {
  name: string;
}

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('EventEngine', () => {
  it('supports emit, emitTo, on, off, and unsubscribe with remote-only loopback by default', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-events', {
      presence: {
        name: 'Alice',
      },
    });
    const roomB = harness.createRoom<TestPresence>('engine-events', {
      presence: {
        name: 'Bob',
      },
    });
    const roomC = harness.createRoom<TestPresence>('engine-events', {
      presence: {
        name: 'Cara',
      },
    });

    const eventsA = roomA.useEvents();
    const eventsB = roomB.useEvents();
    const eventsC = roomC.useEvents();

    const onMessageA = vi.fn();
    const onMessageB = vi.fn();
    const onMessageC = vi.fn();
    const removedByOff = vi.fn();
    const removedByUnsubscribe = vi.fn();

    eventsA.on('message', onMessageA);
    eventsB.on('message', onMessageB);
    eventsC.on('message', onMessageC);

    eventsA.on('message', removedByOff);
    eventsA.off('message', removedByOff);

    const unsubscribe = eventsA.on('message', removedByUnsubscribe);
    unsubscribe();

    await Promise.all([roomA.connect(), roomB.connect(), roomC.connect()]);
    await harness.waitFor(() => roomA.peerCount === 2 && roomB.peerCount === 2 && roomC.peerCount === 2);

    eventsA.emit('message', {
      text: 'broadcast',
    });
    await harness.waitFor(() => onMessageB.mock.calls.length === 1 && onMessageC.mock.calls.length === 1);

    expect(onMessageA).not.toHaveBeenCalled();
    expect(onMessageB).toHaveBeenCalledWith(
      {
        text: 'broadcast',
      },
      expect.objectContaining({
        id: roomA.peerId,
      }),
    );
    expect(onMessageC).toHaveBeenCalledWith(
      {
        text: 'broadcast',
      },
      expect.objectContaining({
        id: roomA.peerId,
      }),
    );
    expect(removedByOff).not.toHaveBeenCalled();
    expect(removedByUnsubscribe).not.toHaveBeenCalled();

    eventsC.emitTo(roomA.peerId, 'message', {
      text: 'direct',
    });
    await harness.waitFor(() => onMessageA.mock.calls.length === 1);

    expect(onMessageA).toHaveBeenCalledWith(
      {
        text: 'direct',
      },
      expect.objectContaining({
        id: roomC.peerId,
      }),
    );
    expect(onMessageB).toHaveBeenCalledTimes(1);
    expect(onMessageC).toHaveBeenCalledTimes(1);

    eventsA.off('message', onMessageA);
    eventsB.emitTo(roomA.peerId, 'message', {
      text: 'after-off',
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(onMessageA).toHaveBeenCalledTimes(1);
  });

  it('supports loopback delivery when enabled', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-events-loopback', {
      presence: {
        name: 'Alice',
      },
    });
    const roomB = harness.createRoom<TestPresence>('engine-events-loopback', {
      presence: {
        name: 'Bob',
      },
    });

    const eventsA = roomA.useEvents({ loopback: true });
    const eventsB = roomB.useEvents();
    const onNoticeA = vi.fn();
    const onNoticeB = vi.fn();

    eventsA.on('notice', onNoticeA);
    eventsB.on('notice', onNoticeB);

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    eventsA.emit('notice', {
      id: 1,
    });
    await harness.waitFor(() => onNoticeA.mock.calls.length === 1 && onNoticeB.mock.calls.length === 1);

    expect(onNoticeA).toHaveBeenCalledWith(
      {
        id: 1,
      },
      expect.objectContaining({
        id: roomA.peerId,
      }),
    );
    expect(onNoticeB).toHaveBeenCalledWith(
      {
        id: 1,
      },
      expect.objectContaining({
        id: roomA.peerId,
      }),
    );
  });
});
