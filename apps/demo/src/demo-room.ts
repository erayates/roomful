export interface DemoRoomOverrides {
  dayOverride?: string | undefined;
  roomOverride?: string | undefined;
}

export interface DemoRoomSelection {
  roomId: string;
  roomKey: string;
}

const ROOM_SANITIZER = /[^a-z0-9-]+/g;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getUtcRoomKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getMillisecondsUntilNextUtcMidnight(date: Date): number {
  const nextMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );

  return Math.max(0, nextMidnight - date.getTime());
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
  date: Date = new Date(),
): DemoRoomSelection {
  if (overrides.roomOverride) {
    return {
      roomId: overrides.roomOverride,
      roomKey: overrides.roomOverride,
    };
  }

  const roomKey = overrides.dayOverride ?? getUtcRoomKey(date);
  return {
    roomId: `demo-${roomKey}`,
    roomKey,
  };
}
