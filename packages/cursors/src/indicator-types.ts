import type { Peer, PresenceData } from '@roomful/core';

/**
 * Configures the typing indicator component.
 *
 * @typeParam TPresence - The peer presence shape.
 */
export interface TypingIndicatorProps<TPresence extends PresenceData = PresenceData> {
  /**
   * Overrides the accessible label announced to assistive technology.
   */
  ariaLabel?: string;

  /**
   * Supplies the peers currently typing.
   */
  peers: readonly Peer<TPresence>[];
}

/**
 * Configures the live indicator component.
 */
export interface LiveIndicatorProps {
  /**
   * Overrides the accessible label announced to assistive technology.
   */
  ariaLabel?: string;

  /**
   * Overrides the indicator color.
   */
  color?: string;

  /**
   * Overrides the indicator size in pixels.
   */
  size?: number;
}
