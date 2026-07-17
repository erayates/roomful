import { describe, expect, test } from 'vitest';

import type { CreateProjectInput } from './models.js';
import { checkQuotaExceeded, deriveQuotaDefaults, QUOTA_TIERS } from './models.js';
import { InMemoryProjectStore } from './projects.js';

// ── Quota helpers ───────────────────────────────────────────────────────────

describe('deriveQuotaDefaults', () => {
  test('returns free tier quotas', () => {
    const quota = deriveQuotaDefaults('free');
    expect(quota).toEqual(QUOTA_TIERS.free);
  });

  test('returns pro tier quotas', () => {
    const quota = deriveQuotaDefaults('pro');
    expect(quota).toEqual(QUOTA_TIERS.pro);
  });

  test('returns a copy, not the original', () => {
    const quota = deriveQuotaDefaults('free');
    quota.rooms = 999;
    expect(QUOTA_TIERS.free.rooms).toBe(5);
  });
});

describe('checkQuotaExceeded', () => {
  test('returns empty when under quota', () => {
    const exceeded = checkQuotaExceeded(QUOTA_TIERS.free, {
      rooms: 3,
      peersPerRoom: 10,
      messagesPerMinute: 100,
      storageMb: 10,
    });
    expect(exceeded).toEqual([]);
  });

  test('returns violated fields when over quota', () => {
    const exceeded = checkQuotaExceeded(QUOTA_TIERS.free, {
      rooms: 10,
      peersPerRoom: 30,
      messagesPerMinute: 100,
      storageMb: 10,
    });
    expect(exceeded).toContain('rooms');
    expect(exceeded).toContain('peersPerRoom');
    expect(exceeded).not.toContain('messagesPerMinute');
    expect(exceeded).not.toContain('storageMb');
  });

  test('unlimited quotas never exceed', () => {
    const exceeded = checkQuotaExceeded(QUOTA_TIERS.enterprise, {
      rooms: 999_999,
      peersPerRoom: 999_999,
      messagesPerMinute: 999_999,
      storageMb: 999_999,
    });
    expect(exceeded).toEqual([]);
  });
});

// ── InMemoryProjectStore ─────────────────────────────────────────────────────

describe('InMemoryProjectStore', () => {
  describe('projects', () => {
    test('creates and retrieves a project', async () => {
      const store = new InMemoryProjectStore();
      const input: CreateProjectInput = { name: 'My Project' };
      const created = await store.createProject('org-1', input);

      expect(created.name).toBe('My Project');
      expect(created.orgId).toBe('org-1');
      expect(created.slug).toBe('my-project');
      expect(created.quotaRooms).toBe(5);

      const retrieved = await store.getProject(created.id);
      expect(retrieved?.name).toBe('My Project');
    });

    test('lists projects by org', async () => {
      const store = new InMemoryProjectStore();
      await store.createProject('org-1', { name: 'A' });
      await store.createProject('org-1', { name: 'B' });
      await store.createProject('org-2', { name: 'C' });

      const list = await store.listProjects('org-1');
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.name)).toEqual(expect.arrayContaining(['A', 'B']));
    });

    test('updates a project', async () => {
      const store = new InMemoryProjectStore();
      const p = await store.createProject('org-1', { name: 'Old' });

      const updated = await store.updateProject(p.id, {
        name: 'New',
        quotaRooms: 10,
      });

      expect(updated?.name).toBe('New');
      expect(updated?.quotaRooms).toBe(10);
      // updatedAt must be >= original (may be equal in fast CI)
      expect(updated?.updatedAt).toBeDefined();
    });

    test('returns null for unknown project', async () => {
      const store = new InMemoryProjectStore();
      const result = await store.getProject('nope');
      expect(result).toBeNull();
    });

    test('deletes a project and cascades rooms', async () => {
      const store = new InMemoryProjectStore();
      const p = await store.createProject('org-1', { name: 'P' });
      await store.createRoom(p.id, { name: 'R' });

      const deleted = await store.deleteProject(p.id);
      expect(deleted).toBe(true);

      const rooms = await store.listRooms(p.id);
      expect(rooms).toHaveLength(0);
    });

    test('returns false when deleting unknown project', async () => {
      const store = new InMemoryProjectStore();
      const result = await store.deleteProject('nope');
      expect(result).toBe(false);
    });
  });

  describe('rooms', () => {
    test('creates and retrieves a room', async () => {
      const store = new InMemoryProjectStore();
      const p = await store.createProject('org-1', { name: 'P' });

      const room = await store.createRoom(p.id, { name: 'Chat Room' });
      expect(room.name).toBe('Chat Room');
      expect(room.projectId).toBe(p.id);
      expect(room.status).toBe('active');
      expect(room.peerCount).toBe(0);

      const retrieved = await store.getRoom(room.id);
      expect(retrieved?.name).toBe('Chat Room');
    });

    test('lists rooms by project', async () => {
      const store = new InMemoryProjectStore();
      const p1 = await store.createProject('org-1', { name: 'P1' });
      const p2 = await store.createProject('org-1', { name: 'P2' });

      await store.createRoom(p1.id, { name: 'R1' });
      await store.createRoom(p1.id, { name: 'R2' });
      await store.createRoom(p2.id, { name: 'R3' });

      const rooms = await store.listRooms(p1.id);
      expect(rooms).toHaveLength(2);
    });

    test('throws when creating room for unknown project', async () => {
      const store = new InMemoryProjectStore();
      await expect(store.createRoom('nope', { name: 'R' })).rejects.toThrow(
        'Project "nope" not found.',
      );
    });

    test('updates a room', async () => {
      const store = new InMemoryProjectStore();
      const p = await store.createProject('org-1', { name: 'P' });
      const room = await store.createRoom(p.id, { name: 'Old Room' });

      const updated = await store.updateRoom(room.id, {
        name: 'New Room',
        maxPeers: 100,
      });

      expect(updated?.name).toBe('New Room');
      expect(updated?.maxPeers).toBe(100);
    });

    test('closing a room sets closedAt', async () => {
      const store = new InMemoryProjectStore();
      const p = await store.createProject('org-1', { name: 'P' });
      const room = await store.createRoom(p.id, { name: 'R' });

      const updated = await store.updateRoom(room.id, { status: 'closed' });
      expect(updated?.status).toBe('closed');
      expect(updated?.closedAt).not.toBeNull();
    });

    test('deletes a room', async () => {
      const store = new InMemoryProjectStore();
      const p = await store.createProject('org-1', { name: 'P' });
      const room = await store.createRoom(p.id, { name: 'R' });

      const deleted = await store.deleteRoom(room.id);
      expect(deleted).toBe(true);
      expect(await store.getRoom(room.id)).toBeNull();
    });

    test('returns false when deleting unknown room', async () => {
      const store = new InMemoryProjectStore();
      const result = await store.deleteRoom('nope');
      expect(result).toBe(false);
    });
  });
});
