import { describe, expect, it } from 'vitest';

import { createInitialStateSnapshot, setStateSnapshot } from './state';
import {
  applyOfflineStateMutation,
  appendOfflineQueueEntry,
  countQueuedStateMutations,
  OFFLINE_EVENT_QUEUE_LIMIT,
  projectOfflineStateSnapshot,
  type OfflineQueueEntry,
} from './offline-queue';

describe('offline queue helpers', () => {
  it('replays queued patch mutations on top of the latest remote snapshot', () => {
    const base = createInitialStateSnapshot(
      {
        flags: {
          local: false,
          remote: false,
        },
      },
      'peer-a',
      1,
    );
    const remoteSnapshot = setStateSnapshot(
      base,
      {
        flags: {
          local: false,
          remote: true,
        },
      },
      'peer-b',
      20,
    );

    const replayed = applyOfflineStateMutation(
      remoteSnapshot,
      {
        kind: 'patch',
        partial: {
          flags: {
            local: true,
          },
        },
        changedBy: 'peer-a',
        timestamp: 10,
      },
      {
        flags: {
          local: false,
          remote: false,
        },
      },
    );

    expect(replayed).not.toBeNull();
    expect(replayed?.value).toEqual({
      flags: {
        local: true,
        remote: true,
      },
    });
    expect(replayed?.changedBy).toBe('peer-a');
    expect(replayed?.timestamp).toBe(10);
    expect(replayed?.vectorClock).toEqual({
      'peer-a': 1,
      'peer-b': 1,
    });
  });

  it('projects queued mutations in order from a synced base snapshot', () => {
    const base = createInitialStateSnapshot(
      {
        count: 0,
        flag: false,
      },
      'peer-a',
      1,
    );

    const firstSnapshot = setStateSnapshot(
      base,
      {
        count: 1,
        flag: false,
      },
      'peer-a',
      10,
    );
    const secondSnapshot = setStateSnapshot(
      firstSnapshot,
      {
        count: 1,
        flag: true,
      },
      'peer-a',
      11,
    );

    const projected = projectOfflineStateSnapshot(
      base,
      [
        {
          type: 'state',
          mutation: {
            kind: 'patch',
            partial: {
              count: 1,
            },
            changedBy: 'peer-a',
            timestamp: 10,
          },
          snapshot: firstSnapshot,
        },
        {
          type: 'state',
          mutation: {
            kind: 'patch',
            partial: {
              flag: true,
            },
            changedBy: 'peer-a',
            timestamp: 11,
          },
          snapshot: secondSnapshot,
        },
      ],
      {
        count: 0,
        flag: false,
      },
    );

    expect(projected.value).toEqual({
      count: 1,
      flag: true,
    });
  });

  it('keeps only the last 100 queued events while preserving queued mutations', () => {
    let queue: OfflineQueueEntry[] = [];

    queue = appendOfflineQueueEntry(queue, {
      type: 'state',
      mutation: {
        kind: 'set',
        value: {
          count: 1,
        },
        changedBy: 'peer-a',
        timestamp: 1,
      },
      snapshot: setStateSnapshot(
        createInitialStateSnapshot(
          {
            count: 0,
          },
          'peer-a',
          0,
        ),
        {
          count: 1,
        },
        'peer-a',
        1,
      ),
    });

    for (let index = 0; index < OFFLINE_EVENT_QUEUE_LIMIT + 5; index += 1) {
      queue = appendOfflineQueueEntry(queue, {
        type: 'event',
        signal: {
          type: 'event',
          roomId: 'room-offline-queue',
          fromPeerId: 'peer-a',
          timestamp: index,
          payload: {
            name: 'message',
            payload: {
              index,
            },
          },
        },
      });
    }

    expect(countQueuedStateMutations(queue)).toBe(1);
    expect(queue).toHaveLength(OFFLINE_EVENT_QUEUE_LIMIT + 1);
    expect(queue[0]?.type).toBe('state');
    expect(queue[1]).toMatchObject({
      type: 'event',
      signal: {
        payload: {
          payload: {
            index: 5,
          },
        },
      },
    });
    expect(queue.at(-1)).toMatchObject({
      type: 'event',
      signal: {
        payload: {
          payload: {
            index: 104,
          },
        },
      },
    });
  });
});
