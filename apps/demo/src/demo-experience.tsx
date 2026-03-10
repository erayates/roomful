import type { RoomStatus } from '@flockjs/core';
import { LiveIndicator, PeerCursor, PresenceBar } from '@flockjs/cursors';
import {
  useConnectionStatus,
  useCursors,
  useEvent,
  usePresence,
  useSharedState,
} from '@flockjs/react';
import {
  type FormEvent,
  type PointerEvent,
  type ReactElement,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';

import { updateIdentityName } from './demo-identity';
import { createShareLinks } from './demo-share';
import {
  appendPointToStroke,
  createPoint,
  createStroke,
  EMPTY_CANVAS_STATE,
  finalizeStroke,
  strokeCount,
  upsertStroke,
} from './demo-strokes';
import type {
  DemoCanvasState,
  DemoIdentity,
  DemoPresence,
  DemoPreviewEvent,
  DemoStroke,
} from './demo-types';

const PREVIEW_CHANNEL = 'demo:stroke-preview';
const CURSOR_CHANNEL = 'demo:cursor';
const PREVIEW_THROTTLE_MS = 48;
const CURSOR_THROTTLE_MS = 24;

interface DemoExperienceProps {
  canonicalBaseUrl: string;
  identity: DemoIdentity;
  onIdentityChange: (identity: DemoIdentity) => void;
  roomLabel: string;
}

interface SurfaceSize {
  height: number;
  width: number;
}

interface DemoRenderedCursor {
  color: string;
  idle: boolean;
  name: string;
  userId: string;
  x: number;
  y: number;
}

interface DemoCursorEvent {
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

    const observer = new ResizeObserver(() => {
      updateSize();
    });
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
  if (stroke.points.length === 0) {
    return;
  }

  const firstPoint = stroke.points[0];
  if (!firstPoint) {
    return;
  }

  const rest = stroke.points.slice(1);
  context.beginPath();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(2, Math.round(Math.min(width, height) * stroke.size));
  context.strokeStyle = stroke.color;
  context.globalAlpha = alpha;
  context.moveTo(firstPoint.x * width, firstPoint.y * height);

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

function drawCanvasScene(
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

function toPoint(event: PointerEvent<HTMLElement>, element: HTMLElement): ReturnType<typeof createPoint> {
  const bounds = element.getBoundingClientRect();
  return createPoint(
    (event.clientX - bounds.left) / Math.max(bounds.width, 1),
    (event.clientY - bounds.top) / Math.max(bounds.height, 1),
  );
}

function statusLabel(status: RoomStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected live';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Connection issue';
    default:
      return 'Starting room';
  }
}

function pruneRemotePreviews(
  current: Record<string, DemoStroke>,
  activePeerIds: readonly string[],
): Record<string, DemoStroke> {
  const allowed = new Set(activePeerIds);
  return Object.fromEntries(
    Object.entries(current).filter(([peerId]) => {
      return allowed.has(peerId);
    }),
  );
}

export function DemoExperience(props: DemoExperienceProps): ReactElement {
  const { canonicalBaseUrl, identity, onIdentityChange, roomLabel } = props;
  const { all, others, self, update } = usePresence<DemoPresence>();
  const connectionStatus = useConnectionStatus<DemoPresence>();
  const cursorTracking = useCursors({ idleAfterMs: 2_400, throttleMs: 24 });
  const [canvasState, setCanvasState] = useSharedState<DemoCanvasState, DemoPresence>('demo-canvas', {
    initialValue: EMPTY_CANVAS_STATE,
    persist: false,
    strategy: 'crdt',
  });
  const [draftName, setDraftName] = useState(identity.name);
  const [localPreview, setLocalPreview] = useState<DemoStroke | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, DemoRenderedCursor>>({});
  const [remotePreviews, setRemotePreviews] = useState<Record<string, DemoStroke>>({});
  const [surfaceElement, setSurfaceElement] = useState<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DemoStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastPreviewSentAtRef = useRef(0);
  const lastCursorSentAtRef = useRef(0);
  const deferredCanvasState = useDeferredValue(canvasState);
  const surfaceSize = useSurfaceSize(surfaceElement);
  const shareLinks = createShareLinks(canonicalBaseUrl);
  const syncedRoomLabelRef = useRef<string | null>(null);
  const cursors = cursorTracking.cursors;

  const publishPreview = useEvent<DemoPreviewEvent, DemoPresence>(PREVIEW_CHANNEL, (payload, from) => {
    if (from.id === self.id) {
      return;
    }

    setRemotePreviews((current) => {
      if (payload.kind === 'end') {
        const existing = current[from.id];
        if (!existing || existing.id !== payload.strokeId) {
          return current;
        }

        const nextPreviews = { ...current };
        delete nextPreviews[from.id];
        return nextPreviews;
      }

      return {
        ...current,
        [from.id]: payload.stroke,
      };
    });
  });
  const publishCursor = useEvent<DemoCursorEvent, DemoPresence>(CURSOR_CHANNEL, (payload, from) => {
    if (from.id === self.id) {
      return;
    }

    setRemoteCursors((current) => {
      return {
        ...current,
        [from.id]: {
          ...payload,
          userId: from.id,
        },
      };
    });
  });

  const attachSurfaceRef = useCallback(
    (element: HTMLDivElement | null): void => {
      setSurfaceElement(element);
      cursorTracking.ref(element);
    },
    [cursorTracking],
  );

  useEffect(() => {
    setDraftName(identity.name);
  }, [identity.name]);

  useEffect(() => {
    if (syncedRoomLabelRef.current === roomLabel) {
      return;
    }

    syncedRoomLabelRef.current = roomLabel;
    update({ color: identity.color, name: identity.name });
  }, [identity.color, identity.name, roomLabel, update]);

  useEffect(() => {
    setRemotePreviews((current) => {
      return pruneRemotePreviews(
        current,
        others.map((peer) => {
          return peer.id;
        }),
      );
    });
    setRemoteCursors((current) => {
      return Object.fromEntries(
        Object.entries(current).filter(([peerId]) => {
          return others.some((peer) => peer.id === peerId);
        }),
      );
    });
  }, [others]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawCanvasScene(
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
      setCanvasState((current) => {
        return upsertStroke(current, stroke);
      });
    });
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
      publishPreview({
        kind: 'update',
        stroke: nextStroke,
      });
    }
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
    publishCursor({
      color: identity.color,
      idle,
      name: identity.name,
      x: point.x,
      y: point.y,
    });
  };

  const finishStroke = (event: PointerEvent<HTMLDivElement>): void => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    updateActiveStroke(event, false);
    const activeStroke = activeStrokeRef.current;
    const finalizedStroke = activeStroke ? finalizeStroke(activeStroke) : null;

    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    setLocalPreview(null);

    if (activeStroke) {
      publishPreview({
        kind: 'end',
        peerId: self.id,
        strokeId: activeStroke.id,
      });
    }

    commitStroke(finalizedStroke);

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      return;
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.isPrimary) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.preventDefault();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic touch/pointer events used in tests may not support capture.
    }

    const nextStroke = appendPointToStroke(
      createStroke(self.id, self.color ?? identity.color),
      toPoint(event, event.currentTarget),
    );
    activePointerIdRef.current = event.pointerId;
    activeStrokeRef.current = nextStroke;
    publishCursorPosition(event, false, false);
    lastPreviewSentAtRef.current = 0;
    setLocalPreview(nextStroke);
    publishPreview({
      kind: 'update',
      stroke: nextStroke,
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    publishCursorPosition(event, false, true);
    updateActiveStroke(event, true);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>): void => {
    publishCursorPosition(event, true, false);
  };

  const handleRenameSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const nextIdentity = updateIdentityName(identity, draftName);
    onIdentityChange(nextIdentity);
    update({
      name: nextIdentity.name,
    });
  };

  const renderedCursors = new Map<string, DemoRenderedCursor>();
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
    <main className="demo-page">
      <div className="demo-page__glow demo-page__glow--left" />
      <div className="demo-page__glow demo-page__glow--right" />
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <div className="hero-panel__eyebrow">
            <LiveIndicator ariaLabel="Realtime room active" color={identity.color} size={14} />
            <span>Realtime by FlockJS</span>
          </div>
          <h1>See FlockJS feel alive in under five seconds.</h1>
          <p>
            Open the canvas, start drawing, and watch presence, cursors, and shared state converge
            instantly across every visitor.
          </p>
          <div className="hero-panel__actions">
            <a className="button button--primary" href={shareLinks.x} rel="noreferrer" target="_blank">
              Share on X
            </a>
            <a
              className="button button--ghost"
              href={shareLinks.linkedin}
              rel="noreferrer"
              target="_blank"
            >
              Share on LinkedIn
            </a>
          </div>
        </div>
        <div className="hero-panel__stats">
          <div className="stat-chip">
            <span className="stat-chip__label">Status</span>
            <strong data-testid="connection-status">{statusLabel(connectionStatus)}</strong>
          </div>
          <div className="stat-chip">
            <span className="stat-chip__label">Room</span>
            <strong data-testid="room-label">{roomLabel}</strong>
          </div>
          <div className="stat-chip">
            <span className="stat-chip__label">People here</span>
            <strong data-testid="presence-count-value">{all.length}</strong>
          </div>
          <div className="stat-chip">
            <span className="stat-chip__label">Saved strokes</span>
            <strong data-testid="stroke-count-value">{strokeCount(canvasState)}</strong>
          </div>
        </div>
      </section>

      <section className="demo-layout">
        <aside className="demo-sidebar">
          <div className="sidebar-card">
            <h2>Your live identity</h2>
            <p>Your cursor and strokes carry this name and color for everyone in the room.</p>
            <form className="identity-form" onSubmit={handleRenameSubmit}>
              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                maxLength={24}
                onChange={(event) => {
                  setDraftName(event.target.value);
                }}
                value={draftName}
              />
              <button className="button button--primary" type="submit">
                Update live cursor
              </button>
            </form>
            <div className="identity-swatch">
              <span aria-hidden="true" style={{ backgroundColor: identity.color }} />
              <strong>{identity.name}</strong>
            </div>
          </div>

          <div className="sidebar-card">
            <h2>Who is here</h2>
            <p>Presence updates are live and each visitor keeps their own cursor color.</p>
            <PresenceBar<DemoPresence> maxVisible={6} showNames size="md" />
          </div>

          <div className="sidebar-card">
            <h2>Why this demo exists</h2>
            <p>
              This room uses FlockJS presence, cursor sync, custom events, and CRDT-backed shared
              state together in one public experience.
            </p>
          </div>
        </aside>

        <section className="canvas-card">
          <div className="canvas-card__header">
            <div>
              <h2>Public shared canvas</h2>
              <p>Draw with mouse, touch, or pen. Everyone here sees each stroke in real time.</p>
            </div>
            <div className="canvas-card__status">
              <LiveIndicator ariaLabel="Canvas is live" color="#ff6b35" size={12} />
              <span>{others.length} other people active</span>
            </div>
          </div>
          <div
            className="canvas-surface"
            data-testid="demo-canvas-surface"
            onPointerCancel={finishStroke}
            onPointerDown={handlePointerDown}
            onPointerLeave={handlePointerLeave}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            ref={attachSurfaceRef}
          >
            <canvas aria-label="Shared collaborative canvas" ref={canvasRef} />
            <div className="canvas-surface__overlay">
              {Array.from(renderedCursors.values()).map((cursor: DemoRenderedCursor) => (
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
            <div className="canvas-surface__hint">
              <span>Drag anywhere to sketch.</span>
              <span>Touch drawing works on mobile.</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
