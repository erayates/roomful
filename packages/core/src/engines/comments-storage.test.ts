import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import type { CommentThread, Peer } from '../types';
import { type CommentsEngineContext, createCommentsEngine } from './comments';
import { createMemoryCommentsStorage } from './comments-storage';

const SELF: Peer = { id: 'peer-a', joinedAt: 0, lastSeen: 0, name: 'Ada' };

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
});
