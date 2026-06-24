import { afterEach, describe, expect, it } from 'vitest';

import type { StateSnapshot } from './state';
import {
  createPersistedStateStorageKey,
  readPersistedLwwState,
  removePersistedLwwState,
  writePersistedLwwState,
} from './state.persistence';

interface MockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function createMemoryStorage(): MockStorage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function setLocalStorage(value: unknown): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value,
  });
}

const sampleSnapshot: StateSnapshot = {
  value: { count: 1 },
  history: [],
  vectorClock: { 'peer-a': 1 },
  changedBy: 'peer-a',
  timestamp: 5,
  reason: 'set',
};

describe('state persistence', () => {
  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('builds a namespaced storage key', () => {
    expect(createPersistedStateStorageKey('room-1')).toBe('roomful:room-1:state');
  });

  it('writes and reads back a persisted snapshot', () => {
    setLocalStorage(createMemoryStorage());

    expect(writePersistedLwwState('room-rt', sampleSnapshot)).toEqual({
      key: 'roomful:room-rt:state',
      ok: true,
    });

    const read = readPersistedLwwState('room-rt');
    expect(read.reason).toBeUndefined();
    expect(read.snapshot).toEqual(sampleSnapshot);
  });

  it('returns a null snapshot with no reason when nothing is stored', () => {
    setLocalStorage(createMemoryStorage());

    const read = readPersistedLwwState('room-empty');
    expect(read.snapshot).toBeNull();
    expect(read.reason).toBeUndefined();
  });

  it('removes a persisted snapshot', () => {
    const storage = createMemoryStorage();
    storage.store.set('roomful:room-x:state', 'stored');
    setLocalStorage(storage);

    expect(removePersistedLwwState('room-x')).toEqual({ key: 'roomful:room-x:state', ok: true });
    expect(storage.store.has('roomful:room-x:state')).toBe(false);
  });

  it('reports unavailable storage for every operation', () => {
    setLocalStorage(undefined);

    expect(readPersistedLwwState('room-u').reason).toBe('unavailable');
    expect(writePersistedLwwState('room-u', sampleSnapshot)).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
    expect(removePersistedLwwState('room-u')).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('reports access failures when storage throws', () => {
    const throwing: MockStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    setLocalStorage(throwing);

    expect(readPersistedLwwState('room-a').reason).toBe('access');
    expect(writePersistedLwwState('room-a', sampleSnapshot).reason).toBe('access');
    expect(removePersistedLwwState('room-a').reason).toBe('access');
  });

  it('reports a serialize failure for non-serializable snapshots', () => {
    setLocalStorage(createMemoryStorage());

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const snapshot: StateSnapshot = { ...sampleSnapshot, value: circular };

    expect(writePersistedLwwState('room-cyc', snapshot).reason).toBe('serialize');
  });

  it('rejects malformed and invalid stored payloads', () => {
    const storage = createMemoryStorage();
    setLocalStorage(storage);

    const cases: Array<{ roomId: string; raw: string; reason: string }> = [
      { roomId: 'room-json', raw: '{not json', reason: 'malformed' },
      { roomId: 'room-scalar', raw: '42', reason: 'invalid' },
      {
        roomId: 'room-version',
        raw: JSON.stringify({ version: 2, strategy: 'lww', snapshot: {} }),
        reason: 'version',
      },
      {
        roomId: 'room-strategy',
        raw: JSON.stringify({ version: 1, strategy: 'crdt', snapshot: {} }),
        reason: 'invalid',
      },
      {
        roomId: 'room-no-snapshot',
        raw: JSON.stringify({ version: 1, strategy: 'lww' }),
        reason: 'invalid',
      },
      {
        roomId: 'room-bad-snapshot',
        raw: JSON.stringify({ version: 1, strategy: 'lww', snapshot: { value: 1 } }),
        reason: 'invalid',
      },
    ];

    for (const { roomId, raw, reason } of cases) {
      storage.store.set(createPersistedStateStorageKey(roomId), raw);
      const result = readPersistedLwwState(roomId);
      expect(result.snapshot).toBeNull();
      expect(result.reason).toBe(reason);
    }
  });
});
