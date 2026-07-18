import type { UsageAggregation, UsageEvent, UsageEventType, UsageQuery } from './types.js';

// ── Interface ─────────────────────────────────────────────────────────────────

/**
 * Pluggable storage backend for usage events.
 * Implementations must be safe for concurrent access.
 */
export interface UsageEventStore {
  /** Records a single usage event. */
  record(event: UsageEvent): Promise<void>;

  /** Queries usage events with optional filtering. Returns aggregated results. */
  query(params: UsageQuery): Promise<UsageAggregation[]>;
}

// ── In-memory implementation ──────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/consistent-type-assertions */

export class InMemoryUsageEventStore implements UsageEventStore {
  private readonly events: UsageEvent[] = [];

  async record(event: UsageEvent): Promise<void> {
    this.events.push(event);
  }

  async query(params: UsageQuery): Promise<UsageAggregation[]> {
    const filtered = this.events.filter((e) => {
      if (e.projectId !== params.projectId) return false;
      if (e.recordedAt < params.from || e.recordedAt > params.to) return false;
      if (params.eventTypes && !params.eventTypes.includes(e.eventType)) return false;
      return true;
    });

    return aggregateUsageEvents(filtered);
  }
}

// ── Aggregation helper ────────────────────────────────────────────────────────

const USAGE_EVENT_TYPE_KEYS: UsageEventType[] = [
  'room.minute',
  'peer.connection',
  'message.sent',
  'storage.byte',
  'recording.minute',
  'ai.action',
];

function aggregateUsageEvents(events: UsageEvent[]): UsageAggregation[] {
  const buckets = new Map<string, Map<UsageEventType, number>>();

  for (const event of events) {
    const hour = new Date(event.recordedAt);
    hour.setUTCMinutes(0, 0, 0);
    const bucketKey = hour.toISOString();

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, new Map());
    }

    const bucket = buckets.get(bucketKey)!;
    bucket.set(event.eventType, (bucket.get(event.eventType) ?? 0) + event.quantity);
  }

  const sortedKeys = [...buckets.keys()].sort();
  return sortedKeys.map((key) => {
    const bucket = buckets.get(key)!;
    const totals = {} as Record<UsageEventType, number>;
    for (const t of USAGE_EVENT_TYPE_KEYS) {
      totals[t] = bucket.get(t) ?? 0;
    }

    return {
      projectId: events[0]?.projectId ?? '',
      windowStart: key,
      windowEnd: new Date(new Date(key).getTime() + 3_600_000).toISOString(),
      totals,
    };
  });
}
