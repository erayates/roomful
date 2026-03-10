import type { Peer, PresenceData } from '@flockjs/core';

import { resolvePeerDisplayName } from './presence-utils';

export const DEFAULT_LIVE_INDICATOR_COLOR = '#22c55e';
export const DEFAULT_LIVE_INDICATOR_SIZE = 10;
export const MAX_TYPING_NAMES = 3;

export function sanitizeIndicatorColor(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const nextValue = value.trim();
  return nextValue === '' ? fallback : nextValue;
}

export function sanitizeIndicatorSize(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(6, Math.floor(value));
}

export function createTypingIndicatorText<TPresence extends PresenceData>(
  peers: readonly Peer<TPresence>[],
): string {
  const displayNames = peers
    .slice(0, MAX_TYPING_NAMES)
    .map((peer) => {
      return resolvePeerDisplayName(peer);
    });
  const remainingCount = Math.max(0, peers.length - displayNames.length);
  const subject = joinDisplayNames(displayNames, remainingCount);

  if (peers.length === 1) {
    return `${subject} is typing`;
  }

  return `${subject} are typing`;
}

function joinDisplayNames(displayNames: readonly string[], remainingCount: number): string {
  const otherSummary =
    remainingCount > 0 ? `${remainingCount} ${remainingCount === 1 ? 'other' : 'others'}` : null;

  if (displayNames.length === 0) {
    return otherSummary ?? 'Someone';
  }

  const items = otherSummary === null ? [...displayNames] : [...displayNames, otherSummary];

  if (items.length === 1) {
    return items[0] ?? 'Someone';
  }

  if (items.length === 2) {
    return `${items[0] ?? 'Someone'} and ${items[1] ?? 'someone else'}`;
  }

  const head = items.slice(0, -1).join(', ');
  const tail = items[items.length - 1] ?? 'someone else';
  return `${head}, and ${tail}`;
}
