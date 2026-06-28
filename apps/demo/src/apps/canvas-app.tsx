import { PeerCursor } from '@roomful/cursors';
import { useCursors, useEvent, usePresence, useSharedState } from '@roomful/react';
import {
  type PointerEvent,
  type ReactElement,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';

import { DEMO_PALETTE } from '../demo-palette';
import {
  appendPointToStroke,
  createPoint,
  createStroke,
  DEFAULT_STROKE_SIZE,
  EMPTY_CANVAS_STATE,
  finalizeStroke,
  upsertStroke,
} from '../demo-strokes';
import type { DemoCanvasState, DemoPresence, DemoPreviewEvent, DemoStroke } from '../demo-types';
import type { MiniAppProps } from './registry';

const PREVIEW_CHANNEL = 'demo:stroke-preview';
const CURSOR_CHANNEL = 'demo:cursor';
const PREVIEW_THROTTLE_MS = 48;
const CURSOR_THROTTLE_MS = 24;

interface BrushOption {
  id: string;
  label: string;
  size: number;
}

const BRUSH_SIZES: readonly BrushOption[] = [
  { id: 'fine', label: 'Fine', size: DEFAULT_STROKE_SIZE * 0.6 },
  { id: 'medium', label: 'Medium', size: DEFAULT_STROKE_SIZE },
  { id: 'bold', label: 'Bold', size: DEFAULT_STROKE_SIZE * 2.4 },
];

interface SurfaceSize {
  height: number;
  width: number;
}

interface RenderedCursor {
  color: string;
  idle: boolean;
  name: string;
  userId: string;
  x: number;
  y: number;
}

interface CursorEvent {
  color: string;
  idle: boolean;
  name: string;
  x: number;
  y: number;
}

function useSurfaceSize(element: HTMLElement | null): SurfaceSize {
  const [size, setSize] = useState<SurfaceSize>({ height: 0, width: 0 });

  useEffect(() => {
    if (!element) {
      return undefined;
    }

    const updateSize = (): void => {
      const nextWidth = Math.round(element.clientWidth);
      const nextHeight = Math.round(element.clientHeight);
      setSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return { height: nextHeight, width: nextWidth };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element]);

  return size;
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: DemoStroke,
  width: number,
  height: number,
  alpha: number,
): void {
  const firstPoint = stroke.points[0];
  if (!firstPoint) {
    return;
  }

  context.beginPath();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(2, Math.round(Math.min(width, height) * stroke.size));
  context.strokeStyle = stroke.color;
  context.globalAlpha = alpha;
  context.moveTo(firstPoint.x * width, firstPoint.y * height);

  const rest = stroke.points.slice(1);
  if (rest.length === 0) {
    context.lineTo(firstPoint.x * width, firstPoint.y * height);
  } else {
    for (const point of rest) {
      context.lineTo(point.x * width, point.y * height);
    }
  }

  context.stroke();
  context.globalAlpha = 1;
}

function drawScene(
  canvas: HTMLCanvasElement,
  size: SurfaceSize,
  committed: readonly DemoStroke[],
  localPreview: DemoStroke | null,
  remotePreviews: readonly DemoStroke[],
): void {
  if (size.width === 0 || size.height === 0) {
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const nextWidth = Math.round(size.width * pixelRatio);
  const nextHeight = Math.round(size.height * pixelRatio);
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);

  for (const stroke of committed) {
    drawStroke(context, stroke, size.width, size.height, 1);
  }
  for (const stroke of remotePreviews) {
    drawStroke(context, stroke, size.width, size.height, 0.6);
  }
  if (localPreview) {
    drawStroke(context, localPreview, size.width, size.height, 0.9);
  }
}

function toPoint(
  event: PointerEvent<HTMLElement>,
  element: HTMLElement,
): ReturnType<typeof createPoint> {
  const bounds = element.getBoundingClientRect();
  return createPoint(
    (event.clientX - bounds.left) / Math.max(bounds.width, 1),
    (event.clientY - bounds.top) / Math.max(bounds.height, 1),
  );
}

export function CanvasApp({ identity }: MiniAppProps): ReactElement {
  const { self } = usePresence<DemoPresence>();
  const cursorTracking = useCursors({ idleAfterMs: 2_400, throttleMs: 24 });
  const [canvasState, setCanvasState] = useSharedState<DemoCanvasState, DemoPresence>('canvas', {
    initialValue: EMPTY_CANVAS_STATE,
    persist: false,
    strategy: 'crdt',
  });

  const [color, setColor] = useState(identity.color);
  const [brush, setBrush] = useState<number>(DEFAULT_STROKE_SIZE);
  const [localPreview, setLocalPreview] = useState<DemoStroke | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RenderedCursor>>({});
  const [remotePreviews, setRemotePreviews] = useState<Record<string, DemoStroke>>({});
  const [surfaceElement, setSurfaceElement] = useState<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DemoStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastPreviewSentAtRef = useRef(0);
  const lastCursorSentAtRef = useRef(0);
  const deferredCanvasState = useDeferredValue(canvasState);
  const surfaceSize = useSurfaceSize(surfaceElement);
  const cursors = cursorTracking.cursors;

  const publishPreview = useEvent<DemoPreviewEvent, DemoPresence>(
    PREVIEW_CHANNEL,
    (payload, from) => {
      if (from.id === self.id) {
        return;
      }

      setRemotePreviews((current) => {
        if (payload.kind === 'end') {
          const existing = current[from.id];
          if (!existing || existing.id !== payload.strokeId) {
            return current;
          }

          const next = { ...current };
          delete next[from.id];
          return next;
        }

        return { ...current, [from.id]: payload.stroke };
      });
    },
  );

  const publishCursor = useEvent<CursorEvent, DemoPresence>(CURSOR_CHANNEL, (payload, from) => {
    if (from.id === self.id) {
      return;
    }

    setRemoteCursors((current) => ({ ...current, [from.id]: { ...payload, userId: from.id } }));
  });

  const attachSurfaceRef = useCallback(
    (element: HTMLDivElement | null): void => {
      setSurfaceElement(element);
      cursorTracking.ref(element);
    },
    [cursorTracking],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawScene(
      canvas,
      surfaceSize,
      deferredCanvasState.strokes,
      localPreview,
      Object.values(remotePreviews),
    );
  }, [deferredCanvasState.strokes, localPreview, remotePreviews, surfaceSize]);

  const commitStroke = (stroke: DemoStroke | null): void => {
    if (!stroke) {
      return;
    }

    startTransition(() => {
      setCanvasState((current) => upsertStroke(current, stroke));
    });
  };

  const publishCursorPosition = (
    event: PointerEvent<HTMLDivElement>,
    idle: boolean,
    throttle: boolean,
  ): void => {
    const now = performance.now();
    if (throttle && now - lastCursorSentAtRef.current < CURSOR_THROTTLE_MS) {
      return;
    }

    lastCursorSentAtRef.current = now;
    const point = toPoint(event, event.currentTarget);
    publishCursor({ color: identity.color, idle, name: identity.name, x: point.x, y: point.y });
  };

  const updateActiveStroke = (event: PointerEvent<HTMLDivElement>, announce: boolean): void => {
    const currentStroke = activeStrokeRef.current;
    if (!currentStroke || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const nextStroke = appendPointToStroke(currentStroke, toPoint(event, event.currentTarget));
    if (nextStroke === currentStroke) {
      return;
    }

    activeStrokeRef.current = nextStroke;
    setLocalPreview(nextStroke);

    const now = performance.now();
    if (announce && now - lastPreviewSentAtRef.current >= PREVIEW_THROTTLE_MS) {
      lastPreviewSentAtRef.current = now;
      publishPreview({ kind: 'update', stroke: nextStroke });
    }
  };

  const finishStroke = (event: PointerEvent<HTMLDivElement>): void => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    updateActiveStroke(event, false);
    const activeStroke = activeStrokeRef.current;
    const finalized = activeStroke ? finalizeStroke(activeStroke) : null;

    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    setLocalPreview(null);

    if (activeStroke) {
      publishPreview({ kind: 'end', peerId: self.id, strokeId: activeStroke.id });
    }

    commitStroke(finalized);

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      return;
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events in tests may not support capture.
    }

    const nextStroke = appendPointToStroke(
      { ...createStroke(self.id, color), size: brush },
      toPoint(event, event.currentTarget),
    );
    activePointerIdRef.current = event.pointerId;
    activeStrokeRef.current = nextStroke;
    publishCursorPosition(event, false, false);
    lastPreviewSentAtRef.current = 0;
    setLocalPreview(nextStroke);
    publishPreview({ kind: 'update', stroke: nextStroke });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    publishCursorPosition(event, false, true);
    updateActiveStroke(event, true);
  };

  const handleUndo = (): void => {
    setCanvasState((current) => {
      const lastMine = [...current.strokes].reverse().find((stroke) => stroke.peerId === self.id);
      if (!lastMine) {
        return current;
      }

      return { ...current, strokes: current.strokes.filter((stroke) => stroke.id !== lastMine.id) };
    });
  };

  const handleClear = (): void => {
    setCanvasState(EMPTY_CANVAS_STATE);
  };

  const renderedCursors = new Map<string, RenderedCursor>();
  for (const cursor of Object.values(remoteCursors)) {
    renderedCursors.set(cursor.userId, cursor);
  }
  for (const cursor of cursors) {
    renderedCursors.set(cursor.userId, {
      color: cursor.color,
      idle: cursor.idle,
      name: cursor.name,
      userId: cursor.userId,
      x: cursor.x,
      y: cursor.y,
    });
  }

  return (
    <div className="canvas-app">
      <div className="toolbar" role="toolbar" aria-label="Drawing tools">
        <div className="toolbar__group" role="group" aria-label="Color">
          {DEMO_PALETTE.map((swatch) => (
            <button
              aria-label={`Use ${swatch} ink`}
              aria-pressed={swatch === color}
              className="swatch"
              key={swatch}
              onClick={() => {
                setColor(swatch);
              }}
              style={{ backgroundColor: swatch }}
              type="button"
            />
          ))}
        </div>
        <div className="toolbar__group" role="group" aria-label="Brush size">
          {BRUSH_SIZES.map((option) => (
            <button
              aria-pressed={option.size === brush}
              className="chip"
              key={option.id}
              onClick={() => {
                setBrush(option.size);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="toolbar__spacer" />
        <button className="chip" onClick={handleUndo} type="button">
          Undo
        </button>
        <button className="chip chip--danger" onClick={handleClear} type="button">
          Clear
        </button>
      </div>

      <span data-testid="stroke-count-value" hidden>
        {canvasState.strokes.length}
      </span>

      <div
        className="canvas-surface"
        data-testid="demo-canvas-surface"
        onPointerCancel={finishStroke}
        onPointerDown={handlePointerDown}
        onPointerLeave={(event) => {
          publishCursorPosition(event, true, false);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        ref={attachSurfaceRef}
      >
        <canvas aria-label="Shared collaborative canvas" ref={canvasRef} />
        <div className="canvas-surface__overlay">
          {Array.from(renderedCursors.values()).map((cursor) => (
            <PeerCursor
              color={cursor.color}
              idle={cursor.idle}
              key={cursor.userId}
              name={cursor.name}
              style="pointer"
              x={cursor.x}
              y={cursor.y}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
