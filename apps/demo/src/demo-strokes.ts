import type { DemoCanvasState, DemoPoint, DemoStroke } from './demo-types';

export const MIN_POINT_DISTANCE = 0.003;
export const DEFAULT_STROKE_SIZE = 0.006;
export const EMPTY_CANVAS_STATE: DemoCanvasState = {
  version: 1,
  strokes: [],
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function pointDistance(a: DemoPoint, b: DemoPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function createStrokeId(peerId: string, now: number): string {
  return `${peerId}-${now}-${globalThis.crypto.randomUUID()}`;
}

export function createStroke(peerId: string, color: string, now: number = Date.now()): DemoStroke {
  return {
    color,
    createdAt: now,
    id: createStrokeId(peerId, now),
    peerId,
    points: [],
    size: DEFAULT_STROKE_SIZE,
  };
}

export function createPoint(x: number, y: number): DemoPoint {
  return {
    x: clamp(x),
    y: clamp(y),
  };
}

export function appendPointToStroke(stroke: DemoStroke, point: DemoPoint): DemoStroke {
  const previousPoint = stroke.points[stroke.points.length - 1];
  if (previousPoint && pointDistance(previousPoint, point) < MIN_POINT_DISTANCE) {
    return stroke;
  }

  return {
    ...stroke,
    points: [...stroke.points, point],
  };
}

export function finalizeStroke(stroke: DemoStroke): DemoStroke | null {
  const firstPoint = stroke.points[0];
  if (!firstPoint) {
    return null;
  }

  if (stroke.points.length === 1) {
    return {
      ...stroke,
      points: [firstPoint, firstPoint],
    };
  }

  return stroke;
}

export function upsertStroke(state: DemoCanvasState, stroke: DemoStroke): DemoCanvasState {
  const existingIndex = state.strokes.findIndex((entry) => entry.id === stroke.id);
  const nextStrokes = [...state.strokes];

  if (existingIndex >= 0) {
    nextStrokes[existingIndex] = stroke;
  } else {
    nextStrokes.push(stroke);
  }

  nextStrokes.sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return left.id.localeCompare(right.id);
    }

    return left.createdAt - right.createdAt;
  });

  return {
    ...state,
    strokes: nextStrokes,
  };
}

export function strokeCount(state: DemoCanvasState): number {
  return state.strokes.length;
}
