import type { Peer, PresenceData } from '@cahoots/core';

/**
 * Positions the collaboration badge relative to its nearest positioned ancestor.
 */
export interface CollaborationBadgePosition {
  /**
   * Sets the bottom offset.
   */
  bottom?: number | string;

  /**
   * Sets the left offset.
   */
  left?: number | string;

  /**
   * Sets the right offset.
   */
  right?: number | string;

  /**
   * Sets the top offset.
   */
  top?: number | string;
}

/**
 * Configures the collaboration badge component.
 *
 * @typeParam TPresence - The peer presence shape.
 */
export interface CollaborationBadgeProps<TPresence extends PresenceData = PresenceData> {
  /**
   * Supplies the peer shown as actively editing.
   */
  peer: Peer<TPresence>;

  /**
   * Overrides the badge position.
   */
  position?: CollaborationBadgePosition;
}
