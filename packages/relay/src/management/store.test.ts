import { describe, expect, it } from 'vitest';

import { InMemoryManagementStore } from './store.js';
import type { RelayDefaults } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function defaults(overrides: Partial<RelayDefaults> = {}): RelayDefaults {
  return {
    maxRooms: 100,
    maxPeersPerRoom: 250,
    maxTotalPeers: 10_000,
    messageRateLimit: 20,
    messageRateIntervalMs: 1_000,
    maxEphemeralTtlMs: 86_400_000,
    maxTotalStateBytes: 104_857_600,
    ...overrides,
  };
}

function newStore(relayDefaults?: RelayDefaults): InMemoryManagementStore {
  return new InMemoryManagementStore(relayDefaults ?? defaults());
}

// ── getDefaults ────────────────────────────────────────────────────────────────

describe('getDefaults', () => {
  it('returns the relay defaults passed at construction', () => {
    const store = newStore(defaults({ maxRooms: 42 }));
    expect(store.getDefaults().maxRooms).toBe(42);
  });
});

// ── Projects ───────────────────────────────────────────────────────────────────

describe('projects', () => {
  describe('createProject', () => {
    it('creates a project with an explicit id', () => {
      const store = newStore();
      const project = store.createProject({
        id: 'my-proj',
        name: 'My Project',
        ownerId: 'acct-1',
      });
      expect(project.id).toBe('my-proj');
      expect(project.name).toBe('My Project');
      expect(project.ownerId).toBe('acct-1');
      expect(project.createdAt).toBeGreaterThan(0);
      expect(project.updatedAt).toBe(project.createdAt);
    });

    it('auto-generates a UUID when id is omitted', () => {
      const store = newStore();
      const project = store.createProject({
        name: 'Auto',
        ownerId: 'acct-1',
      });
      expect(project.id).toBeTruthy();
      expect(project.id.length).toBeGreaterThan(20); // UUIDs are 36 chars
    });

    it('stores optional description', () => {
      const store = newStore();
      const project = store.createProject({
        name: 'P',
        ownerId: 'o',
        description: 'A test project',
      });
      expect(project.description).toBe('A test project');
    });

    it('stores optional metadata', () => {
      const store = newStore();
      const project = store.createProject({
        name: 'P',
        ownerId: 'o',
        metadata: { env: 'staging', version: 2 },
      });
      expect(project.metadata).toEqual({ env: 'staging', version: 2 });
    });

    it('omits description and metadata when not provided', () => {
      const store = newStore();
      const project = store.createProject({
        name: 'P',
        ownerId: 'o',
      });
      expect(project.description).toBeUndefined();
      expect(project.metadata).toBeUndefined();
    });

    it('throws DUPLICATE_PROJECT when id already exists', () => {
      const store = newStore();
      store.createProject({ id: 'dup', name: 'First', ownerId: 'o' });
      expect(() => store.createProject({ id: 'dup', name: 'Second', ownerId: 'o' })).toThrow(
        'already exists',
      );
    });
  });

  describe('getProject', () => {
    it('returns the project by id', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'Project 1', ownerId: 'o' });
      const found = store.getProject('p1');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Project 1');
    });

    it('returns null for a non-existent project', () => {
      const store = newStore();
      expect(store.getProject('nope')).toBeNull();
    });
  });

  describe('listProjects', () => {
    it('returns all projects for wildcard "*"', () => {
      const store = newStore();
      store.createProject({ id: 'a', name: 'A', ownerId: 'acct-1' });
      store.createProject({ id: 'b', name: 'B', ownerId: 'acct-2' });
      const all = store.listProjects('*');
      expect(all).toHaveLength(2);
    });

    it('filters by ownerId', () => {
      const store = newStore();
      store.createProject({ id: 'a', name: 'A', ownerId: 'acct-1' });
      store.createProject({ id: 'b', name: 'B', ownerId: 'acct-2' });
      const filtered = store.listProjects('acct-1');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('a');
    });

    it('returns empty array when no projects exist', () => {
      const store = newStore();
      expect(store.listProjects('*')).toEqual([]);
    });

    it('returns empty array when no projects match ownerId', () => {
      const store = newStore();
      store.createProject({ id: 'a', name: 'A', ownerId: 'acct-1' });
      expect(store.listProjects('acct-unknown')).toEqual([]);
    });
  });

  describe('updateProject', () => {
    it('updates the project name', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'Original', ownerId: 'o' });
      const updated = store.updateProject('p1', { name: 'Renamed' });
      expect(updated!.name).toBe('Renamed');
    });

    it('updates the description', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o', description: 'Old' });
      const updated = store.updateProject('p1', { description: 'New' });
      expect(updated!.description).toBe('New');
    });

    it('updates metadata', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o', metadata: { a: 1 } });
      const updated = store.updateProject('p1', { metadata: { b: 2 } });
      expect(updated!.metadata).toEqual({ b: 2 });
    });

    it('touches updatedAt on every update', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const original = store.getProject('p1')!;

      // Wait 1ms so the clock is guaranteed to tick
      const start = Date.now();
      while (Date.now() === start) {
        /* spin */
      }

      const updated = store.updateProject('p1', { name: 'Renamed' })!;
      expect(updated.updatedAt).toBeGreaterThan(original.updatedAt);
    });

    it('preserves fields not included in the update', () => {
      const store = newStore();
      store.createProject({
        id: 'p1',
        name: 'P',
        ownerId: 'o',
        description: 'keep me',
        metadata: { key: 'keep' },
      });
      const updated = store.updateProject('p1', { name: 'Renamed' });
      expect(updated!.description).toBe('keep me');
      expect(updated!.metadata).toEqual({ key: 'keep' });
      expect(updated!.ownerId).toBe('o');
    });

    it('returns null for a non-existent project', () => {
      const store = newStore();
      expect(store.updateProject('nope', { name: 'X' })).toBeNull();
    });

    it('handles empty update (no fields changed)', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const updated = store.updateProject('p1', {});
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('P');
    });
  });

  describe('deleteProject', () => {
    it('returns true and removes the project', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      expect(store.deleteProject('p1')).toBe(true);
      expect(store.getProject('p1')).toBeNull();
    });

    it('returns false for a non-existent project', () => {
      const store = newStore();
      expect(store.deleteProject('nope')).toBe(false);
    });

    it('cascade-deletes associated rooms', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      store.createRoom('p1', { id: 'r1' });
      store.createRoom('p1', { id: 'r2' });
      store.deleteProject('p1');
      expect(store.getRoom('r1')).toBeNull();
      expect(store.getRoom('r2')).toBeNull();
    });

    it('cascade-deletes associated quota', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      store.setQuota('p1', { maxRooms: 10 });
      store.deleteProject('p1');
      expect(store.getQuota('p1')).toBeNull();
    });

    it('does not affect other projects', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P1', ownerId: 'o' });
      store.createProject({ id: 'p2', name: 'P2', ownerId: 'o' });
      store.createRoom('p1', { id: 'r-p1' });
      store.createRoom('p2', { id: 'r-p2' });
      store.deleteProject('p1');
      expect(store.getProject('p2')).not.toBeNull();
      expect(store.getRoom('r-p2')).not.toBeNull();
    });
  });
});

// ── Rooms ──────────────────────────────────────────────────────────────────────

describe('rooms', () => {
  describe('createRoom', () => {
    it('creates a room with an explicit id', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const room = store.createRoom('p1', { id: 'r1', name: 'Lobby' });
      expect(room.id).toBe('r1');
      expect(room.projectId).toBe('p1');
      expect(room.name).toBe('Lobby');
      expect(room.createdAt).toBeGreaterThan(0);
    });

    it('auto-generates a UUID when id is omitted', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const room = store.createRoom('p1', { name: 'Auto' });
      expect(room.id).toBeTruthy();
      expect(room.id.length).toBeGreaterThan(20);
    });

    it('defaults ephemeral to false', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const room = store.createRoom('p1', { id: 'r1' });
      expect(room.ephemeral).toBe(false);
    });

    it('defaults ttlMs to 0', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const room = store.createRoom('p1', { id: 'r1' });
      expect(room.ttlMs).toBe(0);
    });

    it('accepts explicit ephemeral and ttlMs', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const room = store.createRoom('p1', {
        id: 'r1',
        ephemeral: true,
        ttlMs: 3_600_000,
      });
      expect(room.ephemeral).toBe(true);
      expect(room.ttlMs).toBe(3_600_000);
    });

    it('stores optional metadata', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const room = store.createRoom('p1', {
        id: 'r1',
        metadata: { capacity: 50 },
      });
      expect(room.metadata).toEqual({ capacity: 50 });
    });

    it('throws PROJECT_NOT_FOUND when project does not exist', () => {
      const store = newStore();
      expect(() => store.createRoom('nope', { id: 'r1' })).toThrow('does not exist');
    });

    it('throws DUPLICATE_ROOM when room id already exists', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      store.createRoom('p1', { id: 'r1' });
      expect(() => store.createRoom('p1', { id: 'r1' })).toThrow('already exists');
    });
  });

  describe('getRoom', () => {
    it('returns the room by id', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      store.createRoom('p1', { id: 'r1', name: 'Lobby' });
      const found = store.getRoom('r1');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Lobby');
    });

    it('returns null for a non-existent room', () => {
      const store = newStore();
      expect(store.getRoom('nope')).toBeNull();
    });
  });

  describe('listRooms', () => {
    it('returns rooms for a given project', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P1', ownerId: 'o' });
      store.createProject({ id: 'p2', name: 'P2', ownerId: 'o' });
      store.createRoom('p1', { id: 'r1' });
      store.createRoom('p1', { id: 'r2' });
      store.createRoom('p2', { id: 'r3' });
      const p1Rooms = store.listRooms('p1');
      expect(p1Rooms).toHaveLength(2);
      expect(p1Rooms.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('returns empty array when project has no rooms', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      expect(store.listRooms('p1')).toEqual([]);
    });

    it('returns empty array for a non-existent project', () => {
      const store = newStore();
      expect(store.listRooms('nope')).toEqual([]);
    });
  });

  describe('deleteRoom', () => {
    it('returns true and removes the room', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      store.createRoom('p1', { id: 'r1' });
      expect(store.deleteRoom('r1')).toBe(true);
      expect(store.getRoom('r1')).toBeNull();
    });

    it('returns false for a non-existent room', () => {
      const store = newStore();
      expect(store.deleteRoom('nope')).toBe(false);
    });
  });
});

// ── Quota ──────────────────────────────────────────────────────────────────────

describe('quota', () => {
  describe('setQuota', () => {
    it('creates a new quota entry', () => {
      const store = newStore();
      const quota = store.setQuota('p1', { maxRooms: 10, maxPeersPerRoom: 50 });
      expect(quota.projectId).toBe('p1');
      expect(quota.maxRooms).toBe(10);
      expect(quota.maxPeersPerRoom).toBe(50);
      expect(quota.updatedAt).toBeGreaterThan(0);
    });

    it('replaces an existing quota', () => {
      const store = newStore();
      store.setQuota('p1', { maxRooms: 10 });
      const updated = store.setQuota('p1', { maxRooms: 20 });
      expect(updated.maxRooms).toBe(20);
      expect(store.getQuota('p1')!.maxRooms).toBe(20);
    });

    it('handles partial fields (undefined fields are preserved as undefined)', () => {
      const store = newStore();
      const quota = store.setQuota('p1', { maxRooms: 5 });
      expect(quota.maxRooms).toBe(5);
      expect(quota.maxPeersPerRoom).toBeUndefined();
      expect(quota.maxTotalPeers).toBeUndefined();
    });

    it('sets -1 for unlimited', () => {
      const store = newStore();
      const quota = store.setQuota('p1', { maxRooms: -1 });
      expect(quota.maxRooms).toBe(-1);
    });
  });

  describe('getQuota', () => {
    it('returns the quota when set', () => {
      const store = newStore();
      store.setQuota('p1', { maxRooms: 10 });
      const quota = store.getQuota('p1');
      expect(quota).not.toBeNull();
      expect(quota!.maxRooms).toBe(10);
    });

    it('returns null when no quota is set', () => {
      const store = newStore();
      expect(store.getQuota('p1')).toBeNull();
    });
  });

  describe('deleteQuota', () => {
    it('returns true and removes the quota', () => {
      const store = newStore();
      store.setQuota('p1', { maxRooms: 10 });
      expect(store.deleteQuota('p1')).toBe(true);
      expect(store.getQuota('p1')).toBeNull();
    });

    it('returns false when no quota exists', () => {
      const store = newStore();
      expect(store.deleteQuota('p1')).toBe(false);
    });
  });
});

// ── Usage ──────────────────────────────────────────────────────────────────────

describe('usage', () => {
  describe('getUsage', () => {
    it('returns the correct room count', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      store.createRoom('p1', { id: 'r1' });
      store.createRoom('p1', { id: 'r2' });
      store.createRoom('p1', { id: 'r3' });
      const usage = store.getUsage('p1');
      expect(usage.projectId).toBe('p1');
      expect(usage.roomCount).toBe(3);
    });

    it('returns zero room count for project with no rooms', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const usage = store.getUsage('p1');
      expect(usage.roomCount).toBe(0);
    });

    it('returns zero for a non-existent project', () => {
      const store = newStore();
      const usage = store.getUsage('nope');
      expect(usage.roomCount).toBe(0);
    });

    it('sets totalPeerCount and totalStateBytes to 0', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      store.createRoom('p1', { id: 'r1' });
      const usage = store.getUsage('p1');
      expect(usage.totalPeerCount).toBe(0);
      expect(usage.totalStateBytes).toBe(0);
    });

    it('sets sampledAt to a fresh timestamp', () => {
      const store = newStore();
      store.createProject({ id: 'p1', name: 'P', ownerId: 'o' });
      const before = Date.now();
      const usage = store.getUsage('p1');
      const after = Date.now();
      expect(usage.sampledAt).toBeGreaterThanOrEqual(before);
      expect(usage.sampledAt).toBeLessThanOrEqual(after);
    });
  });
});
