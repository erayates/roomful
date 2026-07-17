import { describe, expect, it } from 'vitest';

import { PostgresManagementStore } from './pg-store.js';
import type { RelayDefaults } from './types.js';

// ── Smart mock pool ────────────────────────────────────────────────────────────

type QueryLogEntry = { text: string; values: unknown[] };

type QueryHandler = (text: string, values: readonly unknown[]) => Record<string, unknown>[];

/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars */

function createMockPool(handler?: QueryHandler) {
  const queryLog: QueryLogEntry[] = [];

  const defaultHandler: QueryHandler = () => [];

  const pool = {
    queryLog,
    query: (text: string, values?: unknown[]) => {
      queryLog.push({ text, values: values ?? [] });
      const fn = handler ?? defaultHandler;
      return Promise.resolve({ rows: fn(text, values ?? []), rowCount: 0 });
    },
  };

  return pool;
}

// Helper: match a query pattern
function hasInsert(text: string): boolean {
  return text.startsWith('INSERT');
}
function hasSelect(text: string): boolean {
  return text.startsWith('SELECT');
}
function hasUpdate(text: string): boolean {
  return text.startsWith('UPDATE');
}
function hasDelete(text: string): boolean {
  return text.startsWith('DELETE');
}
function fromTable(text: string, table: string): boolean {
  return text.includes(table);
}
function hasWhere(text: string, column?: string): boolean {
  if (!column) return text.includes('WHERE');
  return text.includes(`WHERE ${column}`) || text.includes(`WHERE ${column} =`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const DEFAULTS: RelayDefaults = {
  maxRooms: 100,
  maxPeersPerRoom: 250,
  maxTotalPeers: 10_000,
  messageRateLimit: 20,
  messageRateIntervalMs: 1_000,
  maxEphemeralTtlMs: 86_400_000,
  maxTotalStateBytes: 104_857_600,
};

function projectRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'proj-1',
    name: 'P1',
    description: null,
    metadata: null,
    owner_id: 'acct-1',
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

function roomRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'room-1',
    project_id: 'proj-1',
    name: 'Lobby',
    metadata: null,
    created_at: 1000,
    ephemeral: false,
    ttl_ms: 0,
    ...overrides,
  };
}

function quotaRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    project_id: 'proj-1',
    max_rooms: 10,
    max_peers_per_room: null,
    max_total_peers: null,
    message_rate_limit: null,
    message_rate_interval_ms: null,
    max_ephemeral_ttl_ms: null,
    max_total_state_bytes: null,
    updated_at: 1000,
    ...overrides,
  };
}

function createStore(handler?: QueryHandler) {
  const pool = createMockPool(handler);
  const store = new PostgresManagementStore({
    pool: pool as unknown as import('pg').Pool,
    defaults: DEFAULTS,
  });
  return { store, pool };
}

function storeWithProject(): ReturnType<typeof createStore> {
  return createStore((text) => {
    if (hasSelect(text) && fromTable(text, 'relay_projects') && hasWhere(text, 'id')) {
      return [projectRow()];
    }
    return [];
  });
}

// ── migrate ────────────────────────────────────────────────────────────────────

describe('migrate', () => {
  it('executes the migration SQL', async () => {
    const { store, pool } = createStore();
    await store.migrate();
    expect(pool.queryLog).toHaveLength(1);
    expect(pool.queryLog[0]?.text).toContain('CREATE TABLE IF NOT EXISTS relay_projects');
    expect(pool.queryLog[0]?.text).toContain('relay_rooms');
    expect(pool.queryLog[0]?.text).toContain('relay_quotas');
  });
});

// ── listProjects ───────────────────────────────────────────────────────────────

describe('listProjects', () => {
  it('queries all projects for wildcard owner', async () => {
    const { store, pool } = createStore((text) => {
      if (hasSelect(text)) return [projectRow(), projectRow({ id: 'proj-2' })];
      return [];
    });
    const result = await store.listProjects('*');
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('proj-1');
    expect(pool.queryLog[0]?.text).not.toContain('WHERE');
  });

  it('filters by ownerId', async () => {
    const { store, pool } = createStore(() => [projectRow()]);
    const result = await store.listProjects('acct-1');
    expect(result).toHaveLength(1);
    expect(pool.queryLog[0]?.text).toContain('WHERE');
    expect(pool.queryLog[0]?.values).toEqual(['acct-1']);
  });

  it('returns empty list when none match', async () => {
    const { store } = createStore(() => []);
    const result = await store.listProjects('acct-unknown');
    expect(result).toEqual([]);
  });
});

// ── getProject ─────────────────────────────────────────────────────────────────

describe('getProject', () => {
  it('returns null when not found', async () => {
    const { store } = createStore(() => []);
    expect(await store.getProject('nope')).toBeNull();
  });

  it('returns a project when found', async () => {
    const row = projectRow({ metadata: { key: 'val' }, description: 'desc' });
    const { store } = createStore((text) => (hasSelect(text) ? [row] : []));
    const result = await store.getProject('proj-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('proj-1');
    expect(result!.description).toBe('desc');
    expect(result!.metadata).toEqual({ key: 'val' });
    expect(result!.ownerId).toBe('acct-1');
  });
});

// ── createProject ──────────────────────────────────────────────────────────────

describe('createProject', () => {
  it('inserts a new project and returns it', async () => {
    const { store, pool } = createStore(() => []);
    const result = await store.createProject({ name: 'New', ownerId: 'acct-1' });
    expect(result.name).toBe('New');
    expect(result.ownerId).toBe('acct-1');
    expect(result.id).toBeTruthy();
    const insertQuery = pool.queryLog.find((q) => hasInsert(q.text));
    expect(insertQuery).toBeDefined();
    expect(insertQuery!.values).toContain('New');
  });

  it('throws DUPLICATE_PROJECT when id exists', async () => {
    const { store } = createStore((text) => (hasSelect(text) ? [{ id: 'dup' }] : []));
    await expect(store.createProject({ id: 'dup', name: 'Dup', ownerId: 'o' })).rejects.toThrow(
      'already exists',
    );
  });

  it('auto-generates id when omitted', async () => {
    const { store } = createStore(() => []);
    const result = await store.createProject({ name: 'Auto', ownerId: 'acct-1' });
    expect(result.id).toBeTruthy();
    expect(result.id.length).toBeGreaterThan(20);
  });
});

// ── updateProject ──────────────────────────────────────────────────────────────

describe('updateProject', () => {
  it('returns null when project not found', async () => {
    const { store } = createStore(() => []);
    expect(await store.updateProject('nope', { name: 'X' })).toBeNull();
  });

  it('updates name via SQL', async () => {
    let callCount = 0;
    const { store, pool } = createStore((text) => {
      callCount++;
      if (hasSelect(text) && callCount === 1) return [projectRow()]; // first getProject before UPDATE
      if (hasSelect(text) && callCount >= 2) return [projectRow({ name: 'New' })]; // getProject after UPDATE
      return [];
    });
    const result = await store.updateProject('proj-1', { name: 'New' });
    expect(result?.name).toBe('New');
    const updateQuery = pool.queryLog.find((q) => hasUpdate(q.text));
    expect(updateQuery).toBeDefined();
    expect(updateQuery!.values).toContain('New');
  });

  it('returns existing project when no fields to update', async () => {
    const { store } = createStore((text) => (hasSelect(text) ? [projectRow()] : []));
    const result = await store.updateProject('proj-1', {});
    expect(result?.name).toBe('P1');
  });
});

// ── deleteProject ──────────────────────────────────────────────────────────────

describe('deleteProject', () => {
  it('returns false when project not found', async () => {
    const { store } = createStore(() => []);
    expect(await store.deleteProject('nope')).toBe(false);
  });

  it('deletes project and returns true', async () => {
    const { store, pool } = createStore((text) => (hasSelect(text) ? [projectRow()] : []));
    const result = await store.deleteProject('proj-1');
    expect(result).toBe(true);
    const deleteQuery = pool.queryLog.find((q) => hasDelete(q.text));
    expect(deleteQuery).toBeDefined();
    expect(deleteQuery!.values).toEqual(['proj-1']);
  });
});

// ── Rooms ──────────────────────────────────────────────────────────────────────

describe('rooms', () => {
  it('listRooms queries by project_id', async () => {
    const { store, pool } = createStore((text) => (hasSelect(text) ? [roomRow()] : []));
    const result = await store.listRooms('proj-1');
    expect(result).toHaveLength(1);
    expect(pool.queryLog[0]?.text).toContain('WHERE project_id');
    expect(pool.queryLog[0]?.values).toEqual(['proj-1']);
  });

  it('getRoom returns null when not found', async () => {
    const { store } = createStore(() => []);
    expect(await store.getRoom('nope')).toBeNull();
  });

  it('getRoom returns room when found', async () => {
    const { store } = createStore((text) => (hasSelect(text) ? [roomRow()] : []));
    const room = await store.getRoom('room-1');
    expect(room?.id).toBe('room-1');
    expect(room?.name).toBe('Lobby');
    expect(room?.projectId).toBe('proj-1');
  });

  it('createRoom throws PROJECT_NOT_FOUND', async () => {
    const { store } = createStore(() => []);
    await expect(store.createRoom('nope', { name: 'R' })).rejects.toThrow('does not exist');
  });

  it('createRoom throws DUPLICATE_ROOM', async () => {
    let selectCount = 0;
    const { store } = createStore((text) => {
      if (hasSelect(text)) {
        selectCount++;
        if (selectCount === 1) return [projectRow()]; // getProject succeeds
        if (selectCount === 2) return [{ id: 'room-1' }]; // duplicate check finds existing
      }
      return [];
    });
    await expect(store.createRoom('proj-1', { id: 'room-1' })).rejects.toThrow('already exists');
  });

  it('createRoom inserts and returns the room', async () => {
    let selectCount = 0;
    const { store, pool } = createStore((text) => {
      if (hasSelect(text)) {
        selectCount++;
        if (selectCount === 1) return [projectRow()]; // getProject succeeds
        if (selectCount === 2) return []; // duplicate check - nothing found
      }
      return [];
    });
    const room = await store.createRoom('proj-1', { id: 'r1', name: 'New' });
    expect(room.id).toBe('r1');
    expect(room.name).toBe('New');
    const insert = pool.queryLog.find((q) => hasInsert(q.text));
    expect(insert).toBeDefined();
  });

  it('deleteRoom returns false when not found', async () => {
    const { store } = createStore(() => []);
    expect(await store.deleteRoom('nope')).toBe(false);
  });

  it('deleteRoom deletes and returns true', async () => {
    const { store, pool } = createStore((text) => (hasSelect(text) ? [roomRow()] : []));
    const result = await store.deleteRoom('room-1');
    expect(result).toBe(true);
    const deleteQuery = pool.queryLog.find((q) => hasDelete(q.text));
    expect(deleteQuery).toBeDefined();
  });
});

// ── Quota ──────────────────────────────────────────────────────────────────────

describe('quota', () => {
  it('getQuota returns null when not set', async () => {
    const { store } = createStore(() => []);
    expect(await store.getQuota('proj-1')).toBeNull();
  });

  it('getQuota returns quota when set', async () => {
    const row = quotaRow({ max_rooms: 10 });
    const { store } = createStore((text) => (hasSelect(text) ? [row] : []));
    const q = await store.getQuota('proj-1');
    expect(q?.maxRooms).toBe(10);
    expect(q?.maxPeersPerRoom).toBeUndefined();
  });

  it('setQuota uses UPSERT (ON CONFLICT DO UPDATE)', async () => {
    const { store, pool } = createStore(() => []);
    await store.setQuota('proj-1', { maxRooms: 50 });
    const insert = pool.queryLog.find((q) => q.text.includes('ON CONFLICT'));
    expect(insert).toBeDefined();
    expect(insert!.values).toContain(50);
  });

  it('setQuota returns the quota object', async () => {
    const { store } = createStore(() => []);
    const q = await store.setQuota('proj-1', { maxRooms: 50, maxPeersPerRoom: 200 });
    expect(q.maxRooms).toBe(50);
    expect(q.maxPeersPerRoom).toBe(200);
  });

  it('deleteQuota returns false when not set', async () => {
    const { store } = createStore(() => []);
    expect(await store.deleteQuota('proj-1')).toBe(false);
  });

  it('deleteQuota deletes and returns true', async () => {
    const { store, pool } = createStore((text) => (hasSelect(text) ? [quotaRow()] : []));
    const result = await store.deleteQuota('proj-1');
    expect(result).toBe(true);
    const deleteQuery = pool.queryLog.find((q) => hasDelete(q.text));
    expect(deleteQuery).toBeDefined();
  });
});

// ── Usage ──────────────────────────────────────────────────────────────────────

describe('getUsage', () => {
  it('returns usage snapshot with room count', async () => {
    const { store, pool } = createStore((text) => (hasSelect(text) ? [{ count: 5 }] : []));
    const usage = await store.getUsage('proj-1');
    expect(usage.roomCount).toBe(5);
    expect(usage.totalPeerCount).toBe(0);
    expect(pool.queryLog[0]?.text).toContain('COUNT');
    expect(pool.queryLog[0]?.values).toEqual(['proj-1']);
  });

  it('returns 0 room count when no rooms', async () => {
    const { store } = createStore((text) => (hasSelect(text) ? [{ count: 0 }] : []));
    const usage = await store.getUsage('proj-1');
    expect(usage.roomCount).toBe(0);
  });
});

// ── getDefaults ────────────────────────────────────────────────────────────────

describe('getDefaults', () => {
  it('returns the defaults passed at construction', async () => {
    const { store } = createStore();
    expect(store.getDefaults().maxRooms).toBe(DEFAULTS.maxRooms);
    expect(store.getDefaults().maxPeersPerRoom).toBe(DEFAULTS.maxPeersPerRoom);
  });
});

// ── Integration test (conditional) ─────────────────────────────────────────────

// These tests require a real PostgreSQL database. Set DATABASE_URL to run them.
const integrationTest = process.env.DATABASE_URL ? it : it.skip;

describe('integration', () => {
  integrationTest('executes full CRUD lifecycle', async () => {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const store = new PostgresManagementStore({ pool, defaults: DEFAULTS });

    try {
      await store.migrate();

      // Create project
      const project = await store.createProject({ name: 'Integration Test', ownerId: 'it' });
      expect(project.id).toBeTruthy();

      // List projects
      const projects = await store.listProjects('it');
      expect(projects.length).toBeGreaterThanOrEqual(1);

      // Update project
      const updated = await store.updateProject(project.id, { name: 'Updated IT' });
      expect(updated?.name).toBe('Updated IT');

      // Create room
      const room = await store.createRoom(project.id, { name: 'IT Room' });
      expect(room.id).toBeTruthy();

      // List rooms
      const rooms = await store.listRooms(project.id);
      expect(rooms.length).toBe(1);

      // Set quota
      const quota = await store.setQuota(project.id, { maxRooms: 50 });
      expect(quota.maxRooms).toBe(50);

      // Get usage
      const usage = await store.getUsage(project.id);
      expect(usage.roomCount).toBe(1);

      // Delete room
      await store.deleteRoom(room.id);

      // Delete project (cascades)
      await store.deleteProject(project.id);

      // Verify deletion
      const gone = await store.getProject(project.id);
      expect(gone).toBeNull();
    } finally {
      await pool.end();
    }
  });
});
