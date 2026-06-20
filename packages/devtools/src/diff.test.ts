import { describe, expect, it } from 'vitest';

import { diffSerializedState } from './diff.js';

describe('diffSerializedState', () => {
  it('reports added, removed, and changed paths', () => {
    expect(
      diffSerializedState(
        {
          count: 1,
          nested: {
            ready: false,
          },
          stale: true,
        },
        {
          count: 2,
          nested: {
            ready: true,
          },
          fresh: 'yes',
        },
      ),
    ).toEqual([
      {
        kind: 'changed',
        next: 2,
        path: 'count',
        previous: 1,
      },
      {
        kind: 'added',
        next: 'yes',
        path: 'fresh',
        previous: null,
      },
      {
        kind: 'changed',
        next: true,
        path: 'nested.ready',
        previous: false,
      },
      {
        kind: 'removed',
        next: null,
        path: 'stale',
        previous: true,
      },
    ]);
  });

  it('stops once the maximum entry count is reached', () => {
    expect(
      diffSerializedState(
        {
          alpha: 1,
          beta: 2,
          gamma: 3,
        },
        {
          alpha: 10,
          beta: 20,
          gamma: 30,
        },
        {
          maxEntries: 2,
        },
      ),
    ).toHaveLength(2);
  });
});
