import type { Peer, PresenceData } from '@flockjs/core';

export interface TypingIndicatorProps<TPresence extends PresenceData = PresenceData> {
  ariaLabel?: string;
  peers: readonly Peer<TPresence>[];
}

export interface LiveIndicatorProps {
  ariaLabel?: string;
  color?: string;
  size?: number;
}
