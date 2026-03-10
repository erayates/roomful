import type { Peer, PresenceData } from '@flockjs/core';

/**
 * Tracks the enter/leave animation phase for a rendered peer.
 */
export type PresenceAnimationPhase = 'entering' | 'entered' | 'exiting';

/**
 * Selects the rendered avatar/chip size.
 */
export type PresenceSize = 'sm' | 'md' | 'lg';

export interface PresenceBaseProps<TPresence extends PresenceData = PresenceData> {
  maxVisible?: number;
  onUserClick?: (peer: Peer<TPresence>) => void;
  size?: PresenceSize;
}

/**
 * Configures the presence bar component.
 *
 * @typeParam TPresence - The peer presence shape.
 */
export interface PresenceBarProps<
  TPresence extends PresenceData = PresenceData,
> extends PresenceBaseProps<TPresence> {
  /**
   * Shows peer names alongside avatars when `true`.
   */
  showNames?: boolean;
}

/**
 * Configures the presence avatars component.
 *
 * @typeParam TPresence - The peer presence shape.
 */
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
