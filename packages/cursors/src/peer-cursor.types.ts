/**
 * Selects the marker style used by `PeerCursor`.
 */
export type PeerCursorStyle = 'arrow' | 'dot' | 'pointer';

/**
 * Configures the peer cursor component.
 */
export interface PeerCursorProps {
  /**
   * Supplies the normalized horizontal coordinate.
   */
  x: number;

  /**
   * Supplies the normalized vertical coordinate.
   */
  y: number;

  /**
   * Supplies the peer display name.
   */
  name: string;

  /**
   * Supplies the peer color.
   */
  color: string;

  /**
   * Indicates whether the peer is idle.
   */
  idle: boolean;

  /**
   * Selects the cursor marker style.
   */
  style: PeerCursorStyle;
}
