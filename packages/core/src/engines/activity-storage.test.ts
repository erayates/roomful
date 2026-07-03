import { describe, expect, it } from 'vitest';

import type { ActivityEntry, Peer } from '../types';
import { type ActivityEngineContext, createActivityEngine } from './activity';
import { createMemoryActivityStorage } from './activity-storage';

const SELF: Peer = { id: 'peer-a', joinedAt: 0, lastSeen: 0, name: 'Ada' };

function makeIds(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `id-${counter}`;
  };
}

function makeContext(storage?: ActivityEngineContext['storage']): ActivityEngineContext {
  return {
    selfPeerId: SELF.id,
    getPeer: () => SELF,
    broadcastEntry: () => {},
    onRemoteEntry: () => {},
    now: () => 1,
    ...(storage ? { storage } : {}),
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createMemoryActivityStorage', () => {
  it('round-trips saved entries', async () => {
    const storage = createMemoryActivityStorage();
    expect(await storage.load()).toEqual([]);

    const entry: ActivityEntry = {
      id: 'e1',
      type: 'comment:added',
      actor: SELF,
      timestamp: 1,
      data: { n: 1 },
    };
    await storage.save([entry]);
    expect(await storage.load()).toEqual([entry]);
  });

  it('clones on save and load so callers cannot mutate the stored copy', async () => {
    const storage = createMemoryActivityStorage();
    const entry: ActivityEntry = {
      id: 'e1',
      type: 'seed',
      actor: SELF,
      timestamp: 1,
      data: { n: 1 },
    };
    await storage.save([entry]);

    // Mutating the caller's copy after save must not change what is stored.
    (entry.data as { n: number }).n = 99;
    const loaded = await storage.load();
    expect((loaded[0]?.data as { n: number }).n).toBe(1);
  });
});

describe('ActivityEngine storage', () => {
  it('persists entries on record and restores them into a fresh feed', async () => {
    const storage = createMemoryActivityStorage();

    const engineA = createActivityEngine(makeContext(storage), makeIds());
    const created = engineA.record('comment:added', { n: 1 });
    await flush();

    const persisted = await storage.load();
    expect(persisted.map((entry) => entry.id)).toContain(created.id);

    // A fresh engine with the same adapter hydrates the persisted entry on startup.
    const engineB = createActivityEngine(makeContext(storage), makeIds());
    await flush();

    const restored = engineB.getEntries();
    expect(restored.map((entry) => entry.id)).toContain(created.id);
    expect(restored.find((entry) => entry.id === created.id)?.type).toBe('comment:added');
  });

  it('merges stored history with a live entry that races the async load', async () => {
    const seeded: ActivityEntry = { id: 'old', type: 'seed', actor: SELF, timestamp: 1 };
    const storage = createMemoryActivityStorage([seeded]);

    const engine = createActivityEngine(makeContext(storage), makeIds());
    // Record synchronously, before hydrate's `await load()` resolves.
    const live = engine.record('live', { n: 1 });
    await flush();

    const ids = engine.getEntries().map((entry) => entry.id);
    expect(ids).toContain(live.id);
    expect(ids).toContain('old');

    // Storage reflects the merged feed, not just the racing live entry.
    const persisted = (await storage.load()).map((entry) => entry.id);
    expect(persisted).toContain(live.id);
    expect(persisted).toContain('old');
  });
});
