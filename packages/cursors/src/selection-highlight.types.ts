import type { Peer, PresenceData } from '@flockjs/core';

/**
 * Describes a text selection range within a target element.
 */
export interface SelectionRange {
  /**
   * Identifies the target element containing the selection.
   */
  elementId: string;

  /**
   * Supplies the selection start offset.
   */
  from: number;

  /**
   * Supplies the selection end offset.
   */
  to: number;
}

/**
 * Configures the selection highlight component.
 *
 * @typeParam TPresence - The peer presence shape.
 */
export interface SelectionHighlightProps<TPresence extends PresenceData = PresenceData> {
  /**
   * Supplies the peer whose selection is being rendered.
   */
  peer: Peer<TPresence>;

  /**
   * Supplies the active selection to highlight, or `null` to clear it.
   */
  selection: SelectionRange | null;
}
