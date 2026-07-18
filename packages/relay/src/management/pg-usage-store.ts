import type { Pool } from 'pg';

/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-argument */
import type { UsageAggregation, UsageEvent, UsageEventType, UsageQuery } from './types.js';

// ── Migration SQL ─────────────────────────────────────────────────────────────

/** Embedded DDL — run via {@link migrate}. */
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS relay_usage_events (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  room_id     TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  quantity    NUMERIC NOT NULL DEFAULT 1,
  unit        TEXT NOT NULL DEFAULT 'count',
  metadata    JSONB,
  recorded_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relay_usage_events_project_time
  ON relay_usage_events(project_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_relay_usage_events_type
  ON relay_usage_events(project_id, event_type, recorded_at);
`;

// ── PostgresUsageEventStore ───────────────────────────────────────────────────

export interface PostgresUsageEventStoreOptions {
  /** A pg Pool instance (lazy — the store will NOT create one for you). */
  pool: Pool;
}

/**
 * PostgreSQL-backed implementation of usage event recording and querying.
 *
 * Designed for production usage metering where events must survive a restart
 * and be queryable across arbitrary time windows.
 */
export class PostgresUsageEventStore {
  private readonly pool: Pool;

  public constructor(options: PostgresUsageEventStoreOptions) {
    this.pool = options.pool;
  }

  /**
   * Records a single usage event.
   */
  public async record(event: UsageEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO relay_usage_events (id, project_id, room_id, event_type, quantity, unit, metadata, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.id,
        event.projectId,
        event.roomId,
        event.eventType,
        event.quantity,
        event.unit,
        JSON.stringify(event.metadata),
        event.recordedAt,
      ],
    );
  }

  /**
   * Queries usage events filtered by project, time range, and optional event types.
   * Returns hourly-aggregated results.
   */
  public async query(params: UsageQuery): Promise<UsageAggregation[]> {
    const conditions: string[] = ['project_id = $1', 'recorded_at >= $2', 'recorded_at <= $3'];
    const values: unknown[] = [params.projectId, params.from, params.to];
    let paramIdx = 4;

    if (params.eventTypes && params.eventTypes.length > 0) {
      conditions.push(`event_type = ANY($${paramIdx})`);
      values.push(params.eventTypes);
      paramIdx++;
    }

    const sql = `
      SELECT
        date_trunc('hour', to_timestamp(recorded_at / 1000)) AS hour,
        event_type,
        SUM(quantity) AS total
      FROM relay_usage_events
      WHERE ${conditions.join(' AND ')}
      GROUP BY hour, event_type
      ORDER BY hour ASC
    `;

    const result = await this.pool.query(sql, values);

    return this.aggregateResults(result.rows);
  }

  private aggregateResults(
    rows: Record<string, unknown>[],
  ): UsageAggregation[] {
    const buckets = new Map<string, Map<string, number>>();

    for (const row of rows) {
      const hour = row.hour instanceof Date
        ? row.hour.toISOString()
        : String(row.hour);
      const eventType = row.event_type as string;
      const total = Number(row.total);

      if (!buckets.has(hour)) {
        buckets.set(hour, new Map());
      }

      const bucket = buckets.get(hour);
      if (!bucket) continue;
      bucket.set(eventType, (bucket.get(eventType) ?? 0) + total);
    }

    const allTypes: UsageEventType[] = [
      'room.minute',
      'peer.connection',
      'message.sent',
      'storage.byte',
      'recording.minute',
      'ai.action',
    ];

    return [...buckets.entries()].map(([hour, bucket]) => {
      const totals = {} as Record<UsageEventType, number>;
      for (const t of allTypes) {
        totals[t] = bucket.get(t) ?? 0;
      }

      return {
        projectId: this.extractProjectId(rows),
        windowStart: hour,
        windowEnd: new Date(new Date(hour).getTime() + 3_600_000).toISOString(),
        totals,
      };
    });
  }

  private extractProjectId(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';
    const first = rows[0];
    if (!first) return '';
    const projectId = first.project_id;
    return typeof projectId === 'string' ? projectId : '';
  }
}

// ── Migration ─────────────────────────────────────────────────────────────────

/**
 * Runs the embedded DDL to ensure the usage events table and indexes exist.
 * Safe to call repeatedly (uses IF NOT EXISTS).
 */
export async function migrate(pool: Pool): Promise<void> {
  await pool.query(MIGRATION_SQL);
}
