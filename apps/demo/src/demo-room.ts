export interface DemoRoomOverrides {
  dayOverride?: string | undefined;
  roomOverride?: string | undefined;
}

export interface DemoRoomSelection {
  roomId: string;
  roomKey: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEMO_ROOM_STORAGE_KEY = 'roomful-demo-room';

const ROOM_SANITIZER = /[^a-z0-9-]+/g;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROOM_ID_PATTERN = /^demo-[a-z0-9]{6,}$/;

export function createDemoRoomId(): string {
  // `randomUUID` is typed as always-present but is missing in non-secure-context / older
  // browsers, so guard it at runtime and fall back to a Math.random-based id.
  const uuid =
    typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : undefined;
  const random = uuid
    ? uuid.replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2).padEnd(12, '0').slice(0, 12);

  return `demo-${random}`;
}

export function readStoredRoomId(storage: StorageLike): string | null {
  try {
    const stored = storage.getItem(DEMO_ROOM_STORAGE_KEY)?.trim();
    if (stored && ROOM_ID_PATTERN.test(stored)) {
      return stored;
    }

    return null;
  } catch {
    return null;
  }
}

export function getOrCreateStoredRoomId(storage: StorageLike): string {
  const existing = readStoredRoomId(storage);
  if (existing) {
    return existing;
  }

  const roomId = createDemoRoomId();
  try {
    storage.setItem(DEMO_ROOM_STORAGE_KEY, roomId);
  } catch {
    // Storage may be read-only (private mode / SSR); fall through with the generated id.
  }

  return roomId;
}

export function readDemoRoomOverrides(searchParams: URLSearchParams): DemoRoomOverrides {
  const rawRoom = searchParams.get('room')?.trim();
  const sanitizedRoom = rawRoom
    ?.toLowerCase()
    .replace(ROOM_SANITIZER, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const rawDay = searchParams.get('day')?.trim();

  return {
    roomOverride: sanitizedRoom || undefined,
    dayOverride: rawDay && DAY_PATTERN.test(rawDay) ? rawDay : undefined,
  };
}

export function resolveDemoRoomSelection(
  overrides: DemoRoomOverrides = {},
  fallbackRoomId: string,
): DemoRoomSelection {
  if (overrides.roomOverride) {
    return {
      roomId: overrides.roomOverride,
      roomKey: overrides.roomOverride,
    };
  }

  if (overrides.dayOverride) {
    return {
      roomId: `demo-${overrides.dayOverride}`,
      roomKey: overrides.dayOverride,
    };
  }

  return {
    roomId: fallbackRoomId,
    roomKey: fallbackRoomId,
  };
}
