/** All supported usage event types. */
export const USAGE_EVENT_TYPES = [
  'room.minute',
  'peer.connection',
  'message.sent',
  'storage.byte',
  'recording.minute',
  'ai.action',
] as const;

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

/** A single usage event emitted by the gateway. */
export interface UsageEvent {
  id: string;
  projectId: string;
  roomId: string;
  eventType: UsageEventType;
  quantity: number;
  unit: string;
  metadata: Record<string, unknown>;
  recordedAt: string;
}

/** Unit labels for each event type. */
export const USAGE_UNITS: Record<UsageEventType, string> = {
  'room.minute': 'minutes',
  'peer.connection': 'connections',
  'message.sent': 'messages',
  'storage.byte': 'bytes',
  'recording.minute': 'minutes',
  'ai.action': 'actions',
};

/** Aggregated usage for a time window. */
export interface UsageAggregation {
  projectId: string;
  windowStart: string;
  windowEnd: string;
  granularity: 'hour' | 'day' | 'month';
  totals: Record<UsageEventType, number>;
}

/** Usage query parameters. */
export interface UsageQuery {
  projectId: string;
  from: string;
  to: string;
  granularity: 'hour' | 'day' | 'month';
  eventTypes?: UsageEventType[];
}

export interface UsageStore {
  record(event: UsageEvent): Promise<void>;
  query(params: UsageQuery): Promise<UsageAggregation[]>;
}

export class InMemoryUsageStore implements UsageStore {
  private readonly events: UsageEvent[] = [];

  async record(event: UsageEvent): Promise<void> {
    this.events.push(event);
  }

  async query(params: UsageQuery): Promise<UsageAggregation[]> {
    const filtered = this.events.filter((e) => {
      if (e.projectId !== params.projectId) return false;
      if (params.eventTypes && !params.eventTypes.includes(e.eventType)) return false;
      return e.recordedAt >= params.from && e.recordedAt <= params.to;
    });

    return aggregateUsage(filtered, params.granularity);
  }
}

function aggregateUsage(events: UsageEvent[], granularity: 'hour' | 'day' | 'month'): UsageAggregation[] {
  const buckets = new Map<string, Map<UsageEventType, number>>();

  for (const event of events) {
    const bucketKey = truncateToGranularity(event.recordedAt, granularity);
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, new Map());
    }
    const bucket = buckets.get(bucketKey);
    if (!bucket) continue;
    bucket.set(event.eventType, (bucket.get(event.eventType) ?? 0) + event.quantity);
  }

  return [...buckets.entries()].map(([key, totals]) => {
    const totalsObj: Record<UsageEventType, number> = {
      'room.minute': 0,
      'peer.connection': 0,
      'message.sent': 0,
      'storage.byte': 0,
      'recording.minute': 0,
      'ai.action': 0,
    };
    for (const [k, v] of totals) {
      totalsObj[k] = v;
    }
    return {
      projectId: events[0]?.projectId ?? '',
      windowStart: key,
      windowEnd: addGranularity(key, granularity),
      granularity,
      totals: totalsObj,
    };
  });
}

function truncateToGranularity(iso: string, granularity: 'hour' | 'day' | 'month'): string {
  const d = new Date(iso);
  switch (granularity) {
    case 'hour':
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())).toISOString();
    case 'day':
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
    case 'month':
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  }
}

function addGranularity(iso: string, granularity: 'hour' | 'day' | 'month'): string {
  const d = new Date(iso);
  switch (granularity) {
    case 'hour':
      d.setUTCHours(d.getUTCHours() + 1);
      break;
    case 'day':
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
  }
  return d.toISOString();
}
