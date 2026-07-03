import { afterEach, describe, expect, it } from 'vitest';

import { createPersistedActivityStorageKey } from '../internal/activity.persistence';
import type { ActivityEntry, Peer } from '../types';
import { type ActivityEngineContext, createActivityEngine } from './activity';
import { createLocalStorageActivityStorage, createMemoryActivityStorage } from './activity-storage';

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

function createMemoryStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function setLocalStorage(value: unknown): void {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value });
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

describe('createLocalStorageActivityStorage', () => {
  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('round-trips entries through Web Storage, keyed per room', async () => {
    const backing = createMemoryStorage();
    setLocalStorage(backing);
    const storage = createLocalStorageActivityStorage('room-1');

    expect(await storage.load()).toEqual([]);

    const entry: ActivityEntry = { id: 'e1', type: 'seed', actor: SELF, timestamp: 1 };
    await storage.save([entry]);

    expect(backing.store.has(createPersistedActivityStorageKey('room-1'))).toBe(true);
    expect(await storage.load()).toEqual([entry]);
  });

  it('degrades to an empty, no-op adapter when Web Storage is unavailable', async () => {
    setLocalStorage(undefined);
    const storage = createLocalStorageActivityStorage('room-1');

    const entry: ActivityEntry = { id: 'e1', type: 'seed', actor: SELF, timestamp: 1 };
    // Neither call throws; load stays empty.
    await storage.save([entry]);
    expect(await storage.load()).toEqual([]);
  });

  it('returns an empty feed for malformed stored data', async () => {
    const backing = createMemoryStorage();
    backing.store.set(createPersistedActivityStorageKey('room-1'), 'not json {');
    setLocalStorage(backing);

    const storage = createLocalStorageActivityStorage('room-1');
    expect(await storage.load()).toEqual([]);
  });

  it('restores a persisted feed into a fresh engine', async () => {
    setLocalStorage(createMemoryStorage());

    const engineA = createActivityEngine(
      makeContext(createLocalStorageActivityStorage('room-1')),
      makeIds(),
    );
    const created = engineA.record('comment:added', { n: 1 });
    await flush();

    const engineB = createActivityEngine(
      makeContext(createLocalStorageActivityStorage('room-1')),
      makeIds(),
    );
    await flush();

    expect(engineB.getEntries().map((entry) => entry.id)).toContain(created.id);
  });
});
