import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { createPersistedCommentsStorageKey } from '../internal/comments.persistence';
import type { CommentThread, Peer } from '../types';
import { type CommentsEngineContext, createCommentsEngine } from './comments';
import { createLocalStorageCommentsStorage, createMemoryCommentsStorage } from './comments-storage';

const SELF: Peer = { id: 'peer-a', joinedAt: 0, lastSeen: 0, name: 'Ada' };

function createMemoryStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function setLocalStorage(value: unknown): void {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value });
}

function makeThread(id: string): CommentThread {
  return {
    id,
    anchor: { elementId: 'cell' },
    author: SELF,
    text: `root ${id}`,
    createdAt: 1,
    resolved: true,
    replies: [{ id: `${id}-r1`, author: SELF, text: 'a reply', createdAt: 2 }],
  };
}

function makeIds(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `id-${counter}`;
  };
}

function makeContext(doc: Y.Doc, storage: CommentsEngineContext['storage']): CommentsEngineContext {
  return {
    actorId: 'peer-a',
    doc,
    getSelfPeer: () => SELF,
    now: () => 1,
    ...(storage ? { storage } : {}),
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createMemoryCommentsStorage', () => {
  it('round-trips saved threads', async () => {
    const storage = createMemoryCommentsStorage();
    expect(await storage.load()).toEqual([]);

    const thread: CommentThread = {
      id: 't1',
      anchor: { elementId: 'cell' },
      author: SELF,
      text: 'hello',
      createdAt: 1,
      resolved: false,
      replies: [],
    };
    await storage.save([thread]);
    expect(await storage.load()).toEqual([thread]);
  });
});

describe('CommentsEngine storage', () => {
  it('persists threads on change and restores them into a fresh room', async () => {
    const storage = createMemoryCommentsStorage();

    const engineA = createCommentsEngine(makeContext(new Y.Doc(), storage), makeIds());
    const created = await engineA.add({ anchor: { elementId: 'cell' }, text: 'hello' });
    await flush();

    const persisted = await storage.load();
    expect(persisted.map((thread) => thread.id)).toContain(created.id);

    // A fresh room with the same adapter hydrates the persisted thread on startup.
    const engineB = createCommentsEngine(makeContext(new Y.Doc(), storage), makeIds());
    await flush();

    const restored = engineB.getAll();
    expect(restored.map((thread) => thread.id)).toContain(created.id);
    expect(restored.find((thread) => thread.id === created.id)?.text).toBe('hello');
  });

  it('restores replies and the resolved flag, not just the root thread', async () => {
    const storage = createMemoryCommentsStorage();

    const engineA = createCommentsEngine(makeContext(new Y.Doc(), storage), makeIds());
    const created = await engineA.add({ anchor: { elementId: 'cell' }, text: 'root' });
    await engineA.thread(created.id).reply('a reply');
    await engineA.thread(created.id).resolve();
    await flush();

    const engineB = createCommentsEngine(makeContext(new Y.Doc(), storage), makeIds());
    await flush();

    const restored = engineB.getAll().find((thread) => thread.id === created.id);
    expect(restored?.resolved).toBe(true);
    expect(restored?.replies.map((reply) => reply.text)).toEqual(['a reply']);
  });
});

describe('createLocalStorageCommentsStorage', () => {
  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('round-trips full threads (replies + resolved) through Web Storage, keyed per room', async () => {
    const backing = createMemoryStorage();
    setLocalStorage(backing);
    const storage = createLocalStorageCommentsStorage('room-1');

    expect(await storage.load()).toEqual([]);

    const thread = makeThread('t1');
    await storage.save([thread]);

    expect(backing.store.has(createPersistedCommentsStorageKey('room-1'))).toBe(true);
    const [loaded] = await storage.load();
    expect(loaded?.resolved).toBe(true);
    expect(loaded?.replies.map((reply) => reply.text)).toEqual(['a reply']);
  });

  it('degrades to an empty, no-op adapter when Web Storage is unavailable', async () => {
    setLocalStorage(undefined);
    const storage = createLocalStorageCommentsStorage('room-1');

    await storage.save([makeThread('t1')]);
    expect(await storage.load()).toEqual([]);
  });
});
