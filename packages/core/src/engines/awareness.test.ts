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

describe('AwarenessEngine', () => {
  it('supports set helpers, subscribe, getAll, and auto-clears remote awareness on disconnect', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-awareness', {
      presence: {
        name: 'Alice',
      },
    });
    const roomB = harness.createRoom<TestPresence>('engine-awareness', {
      presence: {
        name: 'Bob',
      },
    });

    const awarenessA = roomA.useAwareness();
    const awarenessB = roomB.useAwareness();
    const onRemoteAwareness = vi.fn();
    const unsubscribe = awarenessA.subscribe(onRemoteAwareness);

    expect(onRemoteAwareness).toHaveBeenCalledWith([]);

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    awarenessA.set({
      mode: 'draft',
    });
    await harness.waitFor(() => {
      return awarenessB.getAll().some((entry) => {
        return entry.peerId === roomA.peerId && entry.mode === 'draft';
      });
    });

    awarenessB.setTyping(true);
    awarenessB.setFocus('editor');
    awarenessB.setSelection({
      from: 2,
      to: 5,
      elementId: 'editor',
    });
    awarenessB.set({
      theme: 'dark',
    });

    await harness.waitFor(() => {
      return awarenessA.getAll().some((entry) => {
        return (
          entry.peerId === roomB.peerId &&
          entry.typing === true &&
          entry.focus === 'editor' &&
          entry.theme === 'dark'
        );
      });
    });

    expect(awarenessA.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          peerId: roomA.peerId,
          mode: 'draft',
        }),
        expect.objectContaining({
          peerId: roomB.peerId,
          typing: true,
          focus: 'editor',
          theme: 'dark',
          selection: {
            from: 2,
            to: 5,
            elementId: 'editor',
          },
        }),
      ]),
    );

    const latestRemoteSnapshot =
      onRemoteAwareness.mock.calls[onRemoteAwareness.mock.calls.length - 1]?.[0];
    expect(latestRemoteSnapshot).toEqual([
      expect.objectContaining({
        peerId: roomB.peerId,
        typing: true,
        focus: 'editor',
        theme: 'dark',
        selection: {
          from: 2,
          to: 5,
          elementId: 'editor',
        },
      }),
    ]);

    unsubscribe();
    const callCountBeforeLeave = onRemoteAwareness.mock.calls.length;

    await roomB.disconnect();
    await harness.waitFor(() => {
      return awarenessA.getAll().every((entry) => entry.peerId !== roomB.peerId);
    });

    expect(onRemoteAwareness).toHaveBeenCalledTimes(callCountBeforeLeave);
  });
});
