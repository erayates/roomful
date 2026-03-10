export interface DemoIdentity {
  color: string;
  name: string;
}

export interface DemoPresence extends DemoIdentity {
  [key: string]: unknown;
}

export interface DemoPoint {
  x: number;
  y: number;
}

export interface DemoStroke {
  color: string;
  createdAt: number;
  id: string;
  peerId: string;
  points: DemoPoint[];
  size: number;
}

export interface DemoCanvasState {
  strokes: DemoStroke[];
  version: 1;
}

export type DemoPreviewEvent =
  | {
      kind: 'end';
      peerId: string;
      strokeId: string;
    }
  | {
      kind: 'update';
      stroke: DemoStroke;
    };

export interface DemoRuntimeConfig {
  canonicalBaseUrl: string;
  dayOverride?: string | undefined;
  relayUrl: string;
  roomOverride?: string | undefined;
}
