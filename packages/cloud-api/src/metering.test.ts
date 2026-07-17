import { describe, expect, test } from 'vitest';

import { InMemoryUsageStore } from './metering.js';
import type { UsageEvent } from './metering.js';

describe('InMemoryUsageStore', () => {
  test('records and queries events', async () => {
    const store = new InMemoryUsageStore();

    const event: UsageEvent = {
      id: 'evt-1',
      projectId: 'proj-1',
      roomId: 'room-a',
      eventType: 'message.sent',
      quantity: 100,
      unit: 'messages',
      metadata: {},
      recordedAt: new Date('2026-07-17T10:00:00Z').toISOString(),
    };

    await store.record(event);

    const results = await store.query({
      projectId: 'proj-1',
      from: '2026-07-16T00:00:00Z',
      to: '2026-07-18T00:00:00Z',
      granularity: 'day',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].totals['message.sent']).toBe(100);
  });

  test('filters by project', async () => {
    const store = new InMemoryUsageStore();
    await store.record({
      id: 'e1', projectId: 'p1', roomId: 'r1', eventType: 'peer.connection',
      quantity: 5, unit: 'connections', metadata: {},
      recordedAt: new Date('2026-07-17T10:00:00Z').toISOString(),
    });
    await store.record({
      id: 'e2', projectId: 'p2', roomId: 'r2', eventType: 'peer.connection',
      quantity: 10, unit: 'connections', metadata: {},
      recordedAt: new Date('2026-07-17T10:00:00Z').toISOString(),
    });

    const results = await store.query({
      projectId: 'p1',
      from: '2026-07-16T00:00:00Z',
      to: '2026-07-18T00:00:00Z',
      granularity: 'day',
    });

    expect(results[0].totals['peer.connection']).toBe(5);
  });
});
