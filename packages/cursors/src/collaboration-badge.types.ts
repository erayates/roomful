import type { Peer, PresenceData } from '@flockjs/core';

export interface CollaborationBadgePosition {
  bottom?: number | string;
  left?: number | string;
  right?: number | string;
  top?: number | string;
}

export interface CollaborationBadgeProps<TPresence extends PresenceData = PresenceData> {
  peer: Peer<TPresence>;
  position?: CollaborationBadgePosition;
}
