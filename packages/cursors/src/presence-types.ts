import type { Peer, PresenceData } from '@flockjs/core';

export type PresenceAnimationPhase = 'entering' | 'entered' | 'exiting';
export type PresenceSize = 'sm' | 'md' | 'lg';

export interface PresenceBaseProps<TPresence extends PresenceData = PresenceData> {
  maxVisible?: number;
  onUserClick?: (peer: Peer<TPresence>) => void;
  size?: PresenceSize;
}

export interface PresenceBarProps<TPresence extends PresenceData = PresenceData>
  extends PresenceBaseProps<TPresence> {
  showNames?: boolean;
}

export type PresenceAvatarsProps<TPresence extends PresenceData = PresenceData> =
  PresenceBaseProps<TPresence>;

export interface PresenceSizeTokens {
  avatarSize: number;
  borderWidth: number;
  chipGap: number;
  chipHeight: number;
  chipPaddingX: number;
  fontSize: number;
  initialsFontSize: number;
  overlapOffset: number;
}

export interface AnimatedPresencePeer<TPresence extends PresenceData = PresenceData> {
  order: number;
  peer: Peer<TPresence>;
  phase: PresenceAnimationPhase;
}
