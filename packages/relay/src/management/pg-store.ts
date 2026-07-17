import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import type {
  CreateProjectInput,
  CreateRoomInput,
  Project,
  ProjectQuota,
  ProjectUsage,
  RelayDefaults,
  RoomRecord,
  UpdateProjectInput,
  UpdateQuotaInput,
} from './types.js';

// ── Migration SQL ─────────────────────────────────────────────────────────────

/** Embedded DDL for the management schema — run via {@link migrate}. */
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS relay_projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  metadata    JSONB,
  owner_id    TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS relay_rooms (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES relay_projects(id) ON DELETE CASCADE,
  name        TEXT,
  metadata    JSONB,
  created_at  BIGINT NOT NULL,
  ephemeral   BOOLEAN NOT NULL DEFAULT FALSE,
  ttl_ms      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_relay_rooms_project_id ON relay_rooms(project_id);

CREATE TABLE IF NOT EXISTS relay_quotas (
  project_id            TEXT PRIMARY KEY REFERENCES relay_projects(id) ON DELETE CASCADE,
  max_rooms             INT,
  max_peers_per_room    INT,
  max_total_peers       INT,
  message_rate_limit    INT,
  message_rate_interval_ms INT,
  max_ephemeral_ttl_ms  BIGINT,
  max_total_state_bytes BIGINT,
  updated_at            BIGINT NOT NULL
);
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function toProject(row: Record<string, unknown>): Project {
  const description = typeof row.description === 'string' ? row.description : undefined;
  const metaValue: Record<string, unknown> | undefined =
    typeof row.metadata === 'object' && row.metadata !== null
      ? (row.metadata as Record<string, unknown>)
      : undefined;

  return {
    id: String(row.id),
    name: String(row.name),
    description,
    metadata: metaValue,
    ownerId: String(row.owner_id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toRoomRecord(row: Record<string, unknown>): RoomRecord {
  const name = typeof row.name === 'string' ? row.name : undefined;
  const metaValue: Record<string, unknown> | undefined =
    typeof row.metadata === 'object' && row.metadata !== null
      ? (row.metadata as Record<string, unknown>)
      : undefined;

  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name,
    metadata: metaValue,
    createdAt: Number(row.created_at),
    ephemeral: Boolean(row.ephemeral),
    ttlMs: Number(row.ttl_ms),
  };
}

function toProjectQuota(row: Record<string, unknown>): ProjectQuota {
  return {
    projectId: String(row.project_id),
    maxRooms: typeof row.max_rooms === 'number' ? row.max_rooms : undefined,
    maxPeersPerRoom:
      typeof row.max_peers_per_room === 'number' ? row.max_peers_per_room : undefined,
    maxTotalPeers: typeof row.max_total_peers === 'number' ? row.max_total_peers : undefined,
    messageRateLimit:
      typeof row.message_rate_limit === 'number' ? row.message_rate_limit : undefined,
    messageRateIntervalMs:
      typeof row.message_rate_interval_ms === 'number' ? row.message_rate_interval_ms : undefined,
    maxEphemeralTtlMs:
      typeof row.max_ephemeral_ttl_ms === 'number' ? row.max_ephemeral_ttl_ms : undefined,
    maxTotalStateBytes:
      typeof row.max_total_state_bytes === 'number' ? row.max_total_state_bytes : undefined,
    updatedAt: Number(row.updated_at),
  };
}

function now(): number {
  return Date.now();
}

// ── Pool factory ───────────────────────────────────────────────────────────────

/**
 * Options for creating a PostgreSQL management store.
 */
export interface PostgresManagementStoreOptions {
  /** A connected pg.Pool instance. Required. */
  pool: Pool;
  /** Relay-wide defaults for quota resolution. */
  defaults: RelayDefaults;
}

// ── Store implementation ───────────────────────────────────────────────────────

/**
 * PostgreSQL-backed implementation of {@link ManagementStore}.
 *
 * All methods are async. Create with an existing `pg.Pool` and run
 * `store.migrate()` on startup to ensure the schema exists.
 *
 * ```ts
 * import { Pool } from 'pg';
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const store = new PostgresManagementStore({ pool, defaults });
 * await store.migrate();
 * ```
 */
export class PostgresManagementStore {
  private readonly pool: Pool;
  private readonly defaults: RelayDefaults;

  public constructor(options: PostgresManagementStoreOptions) {
    this.pool = options.pool;
    this.defaults = options.defaults;
  }

  // ── Schema migration ─────────────────────────────────────────────────────────
  /**
   * Creates the management schema tables if they do not exist.
   * Call once at startup.
   */
  public async migrate(): Promise<void> {
    await this.pool.query(MIGRATION_SQL);
  }

  // ── Projects ─────────────────────────────────────────────────────────────────

  public async listProjects(ownerId: string): Promise<Project[]> {
    if (ownerId === '*') {
      const result = await this.pool.query('SELECT * FROM relay_projects ORDER BY created_at');
      return result.rows.map(toProject);
    }
    const result = await this.pool.query(
      'SELECT * FROM relay_projects WHERE owner_id = $1 ORDER BY created_at',
      [ownerId],
    );
    return result.rows.map(toProject);
  }

  public async getProject(projectId: string): Promise<Project | null> {
    const result = await this.pool.query('SELECT * FROM relay_projects WHERE id = $1', [projectId]);
    return result.rows[0] ? toProject(result.rows[0]) : null;
  }

  public async createProject(input: CreateProjectInput): Promise<Project> {
    const id = input.id ?? randomUUID();
    const ts = now();

    // Check for duplicates
    const existing = await this.pool.query('SELECT id FROM relay_projects WHERE id = $1', [id]);
    if (existing.rows[0]) {
      throw Object.assign(new Error(`Project "${id}" already exists.`), {
        code: 'DUPLICATE_PROJECT',
      });
    }

    await this.pool.query(
      `INSERT INTO relay_projects (id, name, description, metadata, owner_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        input.name,
        input.description ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.ownerId,
        ts,
        ts,
      ],
    );

    return {
      id,
      name: input.name,
      description: input.description,
      metadata: input.metadata,
      createdAt: ts,
      updatedAt: ts,
      ownerId: input.ownerId,
    };
  }

  public async updateProject(
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project | null> {
    const existing = await this.getProject(projectId);
    if (!existing) {
      return null;
    }

    const ts = now();
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      sets.push(`description = $${paramIndex++}`);
      values.push(input.description ?? null);
    }
    if (input.metadata !== undefined) {
      sets.push(`metadata = ${paramIndex++}`);
      values.push(JSON.stringify(input.metadata));
    }

    if (sets.length === 0) {
      return existing;
    }

    sets.push(`updated_at = $${paramIndex++}`);
    values.push(ts);
    values.push(projectId);

    await this.pool.query(
      `UPDATE relay_projects SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
      values,
    );

    return this.getProject(projectId);
  }

  public async deleteProject(projectId: string): Promise<boolean> {
    const existing = await this.getProject(projectId);
    if (!existing) {
      return false;
    }
    // Cascade handled by ON DELETE CASCADE in schema
    await this.pool.query('DELETE FROM relay_projects WHERE id = $1', [projectId]);
    return true;
  }

  // ── Rooms ────────────────────────────────────────────────────────────────────

  public async listRooms(projectId: string): Promise<RoomRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM relay_rooms WHERE project_id = $1 ORDER BY created_at',
      [projectId],
    );
    return result.rows.map(toRoomRecord);
  }

  public async getRoom(roomId: string): Promise<RoomRecord | null> {
    const result = await this.pool.query('SELECT * FROM relay_rooms WHERE id = $1', [roomId]);
    return result.rows[0] ? toRoomRecord(result.rows[0]) : null;
  }

  public async createRoom(projectId: string, input: CreateRoomInput): Promise<RoomRecord> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project "${projectId}" does not exist.`), {
        code: 'PROJECT_NOT_FOUND',
      });
    }

    const id = input.id ?? randomUUID();
    const existing = await this.pool.query('SELECT id FROM relay_rooms WHERE id = $1', [id]);
    if (existing.rows[0]) {
      throw Object.assign(new Error(`Room "${id}" already exists.`), {
        code: 'DUPLICATE_ROOM',
      });
    }

    const ts = now();
    await this.pool.query(
      `INSERT INTO relay_rooms (id, project_id, name, metadata, created_at, ephemeral, ttl_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        projectId,
        input.name ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        ts,
        input.ephemeral ?? false,
        input.ttlMs ?? 0,
      ],
    );

    return {
      id,
      projectId,
      name: input.name,
      metadata: input.metadata,
      createdAt: ts,
      ephemeral: input.ephemeral ?? false,
      ttlMs: input.ttlMs ?? 0,
    };
  }

  public async deleteRoom(roomId: string): Promise<boolean> {
    const existing = await this.getRoom(roomId);
    if (!existing) {
      return false;
    }
    await this.pool.query('DELETE FROM relay_rooms WHERE id = $1', [roomId]);
    return true;
  }

  // ── Quota ────────────────────────────────────────────────────────────────────

  public async getQuota(projectId: string): Promise<ProjectQuota | null> {
    const result = await this.pool.query('SELECT * FROM relay_quotas WHERE project_id = $1', [
      projectId,
    ]);
    return result.rows[0] ? toProjectQuota(result.rows[0]) : null;
  }

  public async setQuota(projectId: string, input: UpdateQuotaInput): Promise<ProjectQuota> {
    const ts = now();

    await this.pool.query(
      `INSERT INTO relay_quotas (
        project_id, max_rooms, max_peers_per_room, max_total_peers,
        message_rate_limit, message_rate_interval_ms,
        max_ephemeral_ttl_ms, max_total_state_bytes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (project_id) DO UPDATE SET
        max_rooms = EXCLUDED.max_rooms,
        max_peers_per_room = EXCLUDED.max_peers_per_room,
        max_total_peers = EXCLUDED.max_total_peers,
        message_rate_limit = EXCLUDED.message_rate_limit,
        message_rate_interval_ms = EXCLUDED.message_rate_interval_ms,
        max_ephemeral_ttl_ms = EXCLUDED.max_ephemeral_ttl_ms,
        max_total_state_bytes = EXCLUDED.max_total_state_bytes,
        updated_at = EXCLUDED.updated_at`,
      [
        projectId,
        input.maxRooms ?? null,
        input.maxPeersPerRoom ?? null,
        input.maxTotalPeers ?? null,
        input.messageRateLimit ?? null,
        input.messageRateIntervalMs ?? null,
        input.maxEphemeralTtlMs ?? null,
        input.maxTotalStateBytes ?? null,
        ts,
      ],
    );

    return {
      projectId,
      maxRooms: input.maxRooms ?? undefined,
      maxPeersPerRoom: input.maxPeersPerRoom ?? undefined,
      maxTotalPeers: input.maxTotalPeers ?? undefined,
      messageRateLimit: input.messageRateLimit ?? undefined,
      messageRateIntervalMs: input.messageRateIntervalMs ?? undefined,
      maxEphemeralTtlMs: input.maxEphemeralTtlMs ?? undefined,
      maxTotalStateBytes: input.maxTotalStateBytes ?? undefined,
      updatedAt: ts,
    };
  }

  public async deleteQuota(projectId: string): Promise<boolean> {
    const existing = await this.getQuota(projectId);
    if (!existing) {
      return false;
    }
    await this.pool.query('DELETE FROM relay_quotas WHERE project_id = $1', [projectId]);
    return true;
  }

  // ── Usage ────────────────────────────────────────────────────────────────────

  public async getUsage(projectId: string): Promise<ProjectUsage> {
    const roomsResult = await this.pool.query(
      'SELECT COUNT(*) AS count FROM relay_rooms WHERE project_id = $1',
      [projectId],
    );
    const roomCount = Number(roomsResult.rows[0]?.count ?? 0);

    return {
      projectId,
      roomCount,
      totalPeerCount: 0,
      totalStateBytes: 0,
      sampledAt: now(),
    };
  }

  // ── Defaults ─────────────────────────────────────────────────────────────────

  /** Returns the relay defaults the store was created with. */
  public getDefaults(): RelayDefaults {
    return this.defaults;
  }
}
