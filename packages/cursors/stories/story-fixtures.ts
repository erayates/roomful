import type { Peer, PresenceData } from '@cahoots/core';

export type StoryPresence = PresenceData & {
  avatar?: string;
  color?: string;
  name?: string;
  role?: string;
};

const STORY_COLORS = [
  '#2563eb',
  '#0f766e',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#4f46e5',
  '#c2410c',
] as const;

const STORY_NAMES = [
  'Ada Lovelace',
  'Grace Hopper',
  'Margaret Hamilton',
  'Alan Turing',
  'Katherine Johnson',
  'Radia Perlman',
  'Donald Knuth',
  'Barbara Liskov',
] as const;

const STORY_AVATAR_DATA_URI =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='32' fill='%230f766e'/><text x='32' y='40' text-anchor='middle' font-family='Arial' font-size='28' fill='white'>A</text></svg>";

export const SAMPLE_SELECTION_TEXT =
  'Ada Lovelace and Grace Hopper are reviewing a shared draft together.';

export function clampCount(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

export function createStoryPeer(
  index: number,
  overrides: Partial<Peer<StoryPresence>> = {},
): Peer<StoryPresence> {
  const normalizedIndex = Math.abs(index) % STORY_NAMES.length;
  const fallbackId = `story-peer-${normalizedIndex + 1}`;
  const fallbackColor = STORY_COLORS[normalizedIndex] ?? STORY_COLORS[0];
  const fallbackName = STORY_NAMES[normalizedIndex] ?? fallbackId;

  return {
    id: fallbackId,
    joinedAt: 1_000 + normalizedIndex,
    lastSeen: 2_000 + normalizedIndex,
    name: fallbackName,
    color: fallbackColor,
    role: normalizedIndex % 2 === 0 ? 'editor' : 'reviewer',
    ...(normalizedIndex === 0 ? { avatar: STORY_AVATAR_DATA_URI } : {}),
    ...overrides,
  };
}

export function createPresencePeers(count: number): Peer<StoryPresence>[] {
  const normalizedCount = clampCount(count, 1, STORY_NAMES.length);
  return Array.from({ length: normalizedCount }, (_, index) => {
    return createStoryPeer(index);
  });
}

export function createTypingPeers(count: number): Peer<StoryPresence>[] {
  const normalizedCount = clampCount(count, 0, STORY_NAMES.length);
  return Array.from({ length: normalizedCount }, (_, index) => {
    return createStoryPeer(index);
  });
}

export function createStoryRoomId(prefix: string, reactId: string): string {
  const sanitizedReactId = reactId.replace(/[^a-zA-Z0-9-]/g, '');
  return `${prefix}-${sanitizedReactId || 'story'}`;
}

export function toStoryPresence(peer: Peer<StoryPresence>): Partial<StoryPresence> {
  return {
    ...(peer.avatar === undefined ? {} : { avatar: peer.avatar }),
    ...(peer.color === undefined ? {} : { color: peer.color }),
    ...(peer.name === undefined ? {} : { name: peer.name }),
    ...(peer.role === undefined ? {} : { role: peer.role }),
  };
}
