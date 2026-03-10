export type PeerCursorStyle = 'arrow' | 'dot' | 'pointer';

export interface PeerCursorProps {
  x: number;
  y: number;
  name: string;
  color: string;
  idle: boolean;
  style: PeerCursorStyle;
}
