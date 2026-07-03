import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
});

function useIncreasingClock(start = 1_000): void {
  let clock = start;
  vi.spyOn(Date, 'now').mockImplementation(() => {
    clock += 1;
    return clock;
  });
}

describe('ActivityEngine', () => {
  it('records local activity newest-first, with the actor and data', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('activity-local');
    useIncreasingClock();
    const activity = room.useActivity();

    const first = activity.record('comment:added', { threadId: 't1' });
    const second = activity.record('record:locked');

    expect(first.type).toBe('comment:added');
    expect(first.data).toEqual({ threadId: 't1' });
    expect(first.actor.id).toBe(room.peerId);
    expect(activity.getEntries().map((entry) => entry.id)).toEqual([second.id, first.id]);
  });

  it('broadcasts activity to peers in the same room', async () => {
    harness = await createMockRoomHarness();
    const roomA = harness.createRoom('activity-shared');
    const roomB = harness.createRoom('activity-shared');
    const activityA = roomA.useActivity();
    const activityB = roomB.useActivity();
    await roomA.connect();
    await roomB.connect();

    activityA.record('user:did', { n: 1 });

    await harness.waitFor(() => activityB.getEntries().length === 1);
    const [entry] = activityB.getEntries();
    expect(entry?.type).toBe('user:did');
    expect(entry?.data).toEqual({ n: 1 });
    expect(entry?.actor.id).toBe(roomA.peerId);
  });

  it('caps the feed at the configured limit, dropping the oldest', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('activity-limit');
    useIncreasingClock();
    const activity = room.useActivity({ limit: 2 });

    const a = activity.record('a');
    const b = activity.record('b');
    const c = activity.record('c');

    const ids = activity.getEntries().map((entry) => entry.id);
    expect(ids).toEqual([c.id, b.id]);
    expect(ids).not.toContain(a.id);
  });
});
