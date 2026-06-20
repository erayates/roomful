import type { Peer, PresenceData } from '@flockjs/core';

import type { PresenceSize, PresenceSizeTokens } from './presence-types';

export const DEFAULT_MAX_VISIBLE = 5;
export const PRESENCE_ANIMATION_DURATION_MS = 180;
export const PRESENCE_ENTER_DELAY_MS = 16;
export const DEFAULT_FONT_FAMILY = 'ui-sans-serif, system-ui, sans-serif';

const FALLBACK_PEER_COLORS = [
  '#2563eb',
  '#0f766e',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#4f46e5',
  '#c2410c',
] as const;

const PRESENCE_SIZE_TOKENS: Record<PresenceSize, PresenceSizeTokens> = {
  sm: {
    avatarSize: 24,
    borderWidth: 2,
    chipGap: 6,
    chipHeight: 30,
    chipPaddingX: 8,
    fontSize: 12,
    initialsFontSize: 10,
    overlapOffset: 8,
  },
  md: {
    avatarSize: 32,
    borderWidth: 2,
    chipGap: 8,
    chipHeight: 38,
    chipPaddingX: 10,
    fontSize: 13,
    initialsFontSize: 12,
    overlapOffset: 10,
  },
  lg: {
    avatarSize: 40,
    borderWidth: 3,
    chipGap: 10,
    chipHeight: 46,
    chipPaddingX: 12,
    fontSize: 14,
    initialsFontSize: 14,
    overlapOffset: 12,
  },
};

export function sanitizeMaxVisible(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MAX_VISIBLE;
  }

  return Math.max(0, Math.floor(value));
}

export function getPresenceSizeTokens(size: PresenceSize | undefined): PresenceSizeTokens {
  return PRESENCE_SIZE_TOKENS[size ?? 'md'];
}

export function resolvePeerDisplayName<TPresence extends PresenceData>(
  peer: Peer<TPresence>,
): string {
  const name = typeof peer.name === 'string' ? peer.name.trim() : '';
  return name === '' ? peer.id : name;
}

export function resolvePeerInitials<TPresence extends PresenceData>(peer: Peer<TPresence>): string {
  const displayName = resolvePeerDisplayName(peer);
  const words = displayName
    .split(/\s+/)
    .map((word) => {
      return word.trim();
    })
    .filter((word) => {
      return word !== '';
    });

  if (words.length === 0) {
    return peer.id.slice(0, 2).toUpperCase();
  }

  if (words.length === 1) {
    return words[0]?.slice(0, 2).toUpperCase() ?? peer.id.slice(0, 2).toUpperCase();
  }

  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
}

export function resolvePeerAvatar<TPresence extends PresenceData>(
  peer: Peer<TPresence>,
): string | null {
  if (typeof peer.avatar !== 'string') {
    return null;
  }

  const value = peer.avatar.trim();
  return value === '' ? null : value;
}

export function resolvePeerColor<TPresence extends PresenceData>(peer: Peer<TPresence>): string {
  if (typeof peer.color === 'string' && peer.color.trim() !== '') {
    return peer.color;
  }

  const colorIndex = hashString(peer.id) % FALLBACK_PEER_COLORS.length;
  return FALLBACK_PEER_COLORS[colorIndex] ?? FALLBACK_PEER_COLORS[0];
}

export function createPeerListTitle<TPresence extends PresenceData>(
  peers: readonly Peer<TPresence>[],
): string {
  return peers
    .map((peer) => {
      return resolvePeerDisplayName(peer);
    })
    .join(', ');
}

function hashString(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash << 5) - hash + character.charCodeAt(0);
    hash |= 0;
  }

  return Math.abs(hash);
}
