import { env } from '../internal/env';
import type { Unsubscribe, ViewportEngine, ViewportOptions, ViewportState } from '../types';

const DEFAULT_THROTTLE_MS = 64;

/**
 * The local viewport payload the engine measures and streams. The room stamps
 * `peerId` on outbound frames, so the engine works with the peerless shape.
 */
export type ViewportFrame = Omit<ViewportState, 'peerId'>;

/**
 * Distinguishes a plain viewport stream from present-mode, where every peer is
 * asked to follow the presenter.
 */
export type ViewportBroadcastMode = 'broadcast' | 'present';

interface ViewportEngineContext {
  /**
   * Publishes the local viewport frame to peers. `mode` is `'present'` when the
   * local peer is presenting (forcing peers to follow), `'broadcast'` otherwise.
   */
  broadcastViewport(frame: ViewportFrame, mode: ViewportBroadcastMode): void;
  /**
   * Announces the local peer stopped broadcasting/presenting so peers can drop
   * the local viewport and release any forced follow.
   */
  stopViewport(): void;
  /**
   * Returns the latest remote viewport states (excluding the local peer).
   */
  getStates(): ViewportState[];
  /**
   * Subscribes to remote viewport changes. The callback fires with the current
   * remote states whenever an inbound frame is applied.
   */
  subscribe(callback: (states: ViewportState[]) => void): Unsubscribe;
  /**
   * Reports the peer id currently forcing a follow (present mode), or `null`.
   */
  getPresentingPeerId(): string | null;
}

function clamp(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function readNumber(target: unknown, key: string): number {
  if (typeof target !== 'object' || target === null) {
    return 0;
  }

  const value: unknown = Reflect.get(target, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasFunction(target: unknown, key: string): boolean {
  return (
    typeof target === 'object' && target !== null && typeof Reflect.get(target, key) === 'function'
  );
}

/**
 * Reads the active element's CSS-selector identity, preferring an `id` so the
 * selector round-trips through `querySelector`. Returns `null` when no usable
 * focused element is available.
 */
function resolveFocusedElement(element: HTMLElement): string | null {
  const ownerDocument: unknown = Reflect.get(element, 'ownerDocument');
  const doc: unknown =
    typeof ownerDocument === 'object' && ownerDocument !== null
      ? ownerDocument
      : env.hasDocument
        ? document
        : null;
  const active: unknown =
    typeof doc === 'object' && doc !== null ? Reflect.get(doc, 'activeElement') : null;
  if (typeof active !== 'object' || active === null) {
    return null;
  }

  const id: unknown = Reflect.get(active, 'id');
  if (typeof id === 'string' && id.length > 0) {
    return `#${id}`;
  }

  const tagName: unknown = Reflect.get(active, 'tagName');
  if (typeof tagName === 'string' && tagName.length > 0) {
    return tagName.toLowerCase();
  }

  return null;
}

/**
 * Measures the element's normalized scroll, zoom, and dimensions into a frame.
 * Scroll is normalized to `0`–`1` of the scrollable area so the value is
 * resolution-independent; a non-scrollable axis reports `0`.
 */
function measureViewport(element: HTMLElement): ViewportFrame {
  const scrollLeft = readNumber(element, 'scrollLeft');
  const scrollTop = readNumber(element, 'scrollTop');
  const scrollWidth = readNumber(element, 'scrollWidth');
  const scrollHeight = readNumber(element, 'scrollHeight');
  const clientWidth = readNumber(element, 'clientWidth');
  const clientHeight = readNumber(element, 'clientHeight');

  const maxScrollX = scrollWidth - clientWidth;
  const maxScrollY = scrollHeight - clientHeight;

  return {
    scrollX: maxScrollX > 0 ? clamp(scrollLeft / maxScrollX) : 0,
    scrollY: maxScrollY > 0 ? clamp(scrollTop / maxScrollY) : 0,
    zoom: 1,
    viewportWidth: clientWidth,
    viewportHeight: clientHeight,
    focusedElement: resolveFocusedElement(element),
  };
}

function areFramesEqual(a: ViewportFrame | null, b: ViewportFrame): boolean {
  return (
    a !== null &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.zoom === b.zoom &&
    a.viewportWidth === b.viewportWidth &&
    a.viewportHeight === b.viewportHeight &&
    a.focusedElement === b.focusedElement
  );
}

/**
 * Creates the viewport synchronization engine. DOM observation, normalization,
 * throttling, and applying a followed peer's scroll all live here; the room
 * supplies transport via {@link ViewportEngineContext}.
 *
 * @param context - The room callbacks that publish and subscribe to viewports.
 * @param options - Optional viewport tracking configuration.
 * @returns The viewport engine bound to the room.
 */
export function createViewportEngine(
  context: ViewportEngineContext,
  options: ViewportOptions = {},
): ViewportEngine {
  const throttleMs = Math.max(0, options.throttleMs ?? DEFAULT_THROTTLE_MS);

  let mountedElement: HTMLElement | null = null;
  let broadcasting = false;
  let presenting = false;
  let followedPeerId: string | null = null;
  let lastFrame: ViewportFrame | null = null;

  let lastDispatchAt: number | null = null;
  let throttleTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  let followSubscription: Unsubscribe | null = null;
  // Guards against the scrollTo we issue while following re-triggering our own
  // scroll listener and bouncing a frame back out.
  let applyingRemoteScroll = false;

  const currentMode = (): ViewportBroadcastMode => {
    return presenting ? 'present' : 'broadcast';
  };

  const publishFrame = (frame: ViewportFrame): void => {
    lastFrame = frame;
    lastDispatchAt = Date.now();
    context.broadcastViewport(frame, currentMode());
  };

  const clearThrottleTimer = (): void => {
    if (throttleTimer === null) {
      return;
    }

    globalThis.clearTimeout(throttleTimer);
    throttleTimer = null;
  };

  const dispatchFrame = (frame: ViewportFrame): void => {
    if (!broadcasting && !presenting) {
      return;
    }

    if (areFramesEqual(lastFrame, frame)) {
      return;
    }

    if (throttleMs === 0 || lastDispatchAt === null || Date.now() - lastDispatchAt >= throttleMs) {
      clearThrottleTimer();
      publishFrame(frame);
      return;
    }

    if (throttleTimer !== null) {
      return;
    }

    const waitMs = Math.max(0, throttleMs - (Date.now() - lastDispatchAt));
    throttleTimer = globalThis.setTimeout(() => {
      throttleTimer = null;
      if ((!broadcasting && !presenting) || !mountedElement) {
        return;
      }

      const next = measureViewport(mountedElement);
      if (areFramesEqual(lastFrame, next)) {
        return;
      }

      publishFrame(next);
    }, waitMs);
  };

  const captureAndDispatch = (): void => {
    if (!mountedElement || applyingRemoteScroll) {
      return;
    }

    dispatchFrame(measureViewport(mountedElement));
  };

  const scrollListener = (): void => {
    captureAndDispatch();
  };

  const removeScrollListener = (): void => {
    if (mountedElement && hasFunction(mountedElement, 'removeEventListener')) {
      mountedElement.removeEventListener('scroll', scrollListener);
    }
  };

  /**
   * Applies a followed peer's normalized scroll to the mounted element by
   * denormalizing against the local scrollable area and calling `scrollTo`.
   * Zoom is intentionally NOT applied — it is surfaced in state for the app.
   */
  const applyViewport = (state: ViewportState): void => {
    const element = mountedElement;
    if (!element) {
      return;
    }

    const scrollWidth = readNumber(element, 'scrollWidth');
    const scrollHeight = readNumber(element, 'scrollHeight');
    const clientWidth = readNumber(element, 'clientWidth');
    const clientHeight = readNumber(element, 'clientHeight');
    const left = Math.max(0, scrollWidth - clientWidth) * clamp(state.scrollX);
    const top = Math.max(0, scrollHeight - clientHeight) * clamp(state.scrollY);

    applyingRemoteScroll = true;
    try {
      if (hasFunction(element, 'scrollTo')) {
        element.scrollTo({ left, top });
      } else {
        Reflect.set(element, 'scrollLeft', left);
        Reflect.set(element, 'scrollTop', top);
      }
    } finally {
      applyingRemoteScroll = false;
    }
  };

  const resolveTargetPeerId = (): string | null => {
    return context.getPresentingPeerId() ?? followedPeerId;
  };

  const applyFollowedViewport = (): void => {
    const targetPeerId = resolveTargetPeerId();
    if (!targetPeerId) {
      return;
    }

    const state = context.getStates().find((entry) => {
      return entry.peerId === targetPeerId;
    });
    if (state) {
      applyViewport(state);
    }
  };

  // A single subscription stays attached while mounted so a remote peer entering
  // present mode can force a follow even when this peer never called follow().
  const ensureRemoteSubscription = (): void => {
    if (followSubscription !== null) {
      return;
    }

    followSubscription = context.subscribe(() => {
      applyFollowedViewport();
    });
  };

  const teardownRemoteSubscription = (): void => {
    followSubscription?.();
    followSubscription = null;
  };

  const startStreaming = (mode: ViewportBroadcastMode): void => {
    presenting = mode === 'present';
    broadcasting = true;

    if (!mountedElement) {
      return;
    }

    // Force the first frame out so peers see this viewport immediately.
    lastFrame = null;
    lastDispatchAt = null;
    publishFrame(measureViewport(mountedElement));
  };

  const stopStreaming = (): void => {
    if (!broadcasting && !presenting) {
      return;
    }

    broadcasting = false;
    presenting = false;
    clearThrottleTimer();
    lastFrame = null;
    lastDispatchAt = null;
    context.stopViewport();
  };

  return {
    mount(element) {
      removeScrollListener();
      mountedElement = element;

      if (hasFunction(element, 'addEventListener')) {
        element.addEventListener('scroll', scrollListener);
      }

      ensureRemoteSubscription();

      // A late mount (after broadcast()/follow() were called) still wires up.
      if (broadcasting || presenting) {
        lastFrame = null;
        lastDispatchAt = null;
        publishFrame(measureViewport(element));
      }

      applyFollowedViewport();
    },
    unmount() {
      removeScrollListener();
      stopStreaming();
      teardownRemoteSubscription();
      followedPeerId = null;
      mountedElement = null;
      lastFrame = null;
      lastDispatchAt = null;
    },
    broadcast() {
      startStreaming('broadcast');
    },
    stopBroadcast() {
      stopStreaming();
    },
    present() {
      startStreaming('present');
    },
    stopPresenting() {
      stopStreaming();
    },
    follow(peerId) {
      followedPeerId = peerId;
      ensureRemoteSubscription();
      applyFollowedViewport();
    },
    unfollow() {
      followedPeerId = null;
    },
    subscribe(cb) {
      return context.subscribe(cb);
    },
    getAll() {
      return context.getStates();
    },
    get(peerId) {
      return context.getStates().find((entry) => {
        return entry.peerId === peerId;
      });
    },
  };
}
