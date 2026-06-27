import {
  createDemoRoomId,
  DEMO_ROOM_STORAGE_KEY,
  getOrCreateStoredRoomId,
  readDemoRoomOverrides,
  readStoredRoomId,
  resolveDemoRoomSelection,
} from './demo-room';

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function createFakeStorage(initial: Record<string, string> = {}): {
  storage: FakeStorage;
  setItem: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  const setItem = vi.fn((key: string, value: string) => {
    store.set(key, value);
  });

  return {
    setItem,
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem,
    },
  };
}

describe('demo-room', () => {
  it('creates random demo room ids', () => {
    expect(createDemoRoomId()).toMatch(/^demo-[a-z0-9]{6,}$/);
    expect(createDemoRoomId()).not.toBe(createDemoRoomId());
  });

  it('reads a valid stored room id', () => {
    const { storage } = createFakeStorage({ [DEMO_ROOM_STORAGE_KEY]: 'demo-abc123def456' });

    expect(readStoredRoomId(storage)).toBe('demo-abc123def456');
  });

  it('returns null for missing or invalid stored room ids', () => {
    expect(readStoredRoomId(createFakeStorage().storage)).toBeNull();
    expect(
      readStoredRoomId(createFakeStorage({ [DEMO_ROOM_STORAGE_KEY]: 'not-a-room' }).storage),
    ).toBeNull();
  });

  it('returns an existing stored room id without persisting again', () => {
    const { storage, setItem } = createFakeStorage({
      [DEMO_ROOM_STORAGE_KEY]: 'demo-abc123def456',
    });

    expect(getOrCreateStoredRoomId(storage)).toBe('demo-abc123def456');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('creates and persists a room id when none is stored', () => {
    const { storage, setItem } = createFakeStorage();

    const roomId = getOrCreateStoredRoomId(storage);

    expect(roomId).toMatch(/^demo-[a-z0-9]{6,}$/);
    expect(setItem).toHaveBeenCalledWith(DEMO_ROOM_STORAGE_KEY, roomId);
  });

  it('sanitizes explicit room overrides', () => {
    expect(readDemoRoomOverrides(new URLSearchParams('room=  Demo Room !!  '))).toEqual({
      dayOverride: undefined,
      roomOverride: 'demo-room',
    });
  });

  it('uses an explicit room override over the fallback', () => {
    expect(
      resolveDemoRoomSelection(
        readDemoRoomOverrides(new URLSearchParams('room=team-sync')),
        'demo-fallback123',
      ),
    ).toEqual({
      roomId: 'team-sync',
      roomKey: 'team-sync',
    });
  });

  it('uses a day override when provided', () => {
    expect(
      resolveDemoRoomSelection(
        readDemoRoomOverrides(new URLSearchParams('day=2026-03-18')),
        'demo-fallback123',
      ),
    ).toEqual({
      roomId: 'demo-2026-03-18',
      roomKey: '2026-03-18',
    });
  });

  it('falls back to the provided room id when no overrides are present', () => {
    expect(resolveDemoRoomSelection({}, 'demo-fallback123')).toEqual({
      roomId: 'demo-fallback123',
      roomKey: 'demo-fallback123',
    });
  });
});
