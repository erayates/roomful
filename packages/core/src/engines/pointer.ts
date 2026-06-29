import { env } from '../internal/env';
import type {
  PointerBeam,
  PointerEngine,
  PointerOptions,
  PointerRenderOptions,
  PointerStyle,
  Unsubscribe,
} from '../types';

const DEFAULT_THROTTLE_MS = 32;
const POINTER_ROOT_ATTRIBUTE = 'data-roomful-pointer-root';
const POINTER_NODE_ATTRIBUTE = 'data-roomful-peer-pointer';
const POINTER_PEER_ATTRIBUTE = 'data-peer-id';
const POINTER_STYLE_ATTRIBUTE = 'data-roomful-pointer-style';
const DEFAULT_POINTER_COLOR = '#4F46E5';

/**
 * The local pointer payload the engine measures and streams. The room stamps
 * `peerId`, `name`, `color`, and `active` onto outbound beams (resolving the
 * label and color from the peer's presence), so the engine works with the
 * coordinate-only shape.
 */
export type PointerFrame = Pick<PointerBeam, 'x' | 'y'>;

interface PointerEngineContext {
  /**
   * Publishes the local pointer position to peers while the pointer is active.
   */
  broadcastPointer(frame: PointerFrame): void;
  /**
   * Announces the local pointer stopped broadcasting so peers drop the beam.
   */
  stopPointer(): void;
  /**
   * Returns the latest remote pointer beams (excluding the local peer).
   */
  getBeams(): PointerBeam[];
  /**
   * Subscribes to remote pointer changes. The callback fires with the current
   * remote beams whenever an inbound beam is applied or dropped.
   */
  subscribe(callback: (beams: PointerBeam[]) => void): Unsubscribe;
}

interface PointerPoint {
  clientX: number;
  clientY: number;
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

function isPointerPoint(value: unknown): value is PointerPoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'clientX') === 'number' &&
    typeof Reflect.get(value, 'clientY') === 'number'
  );
}

function hasFunction(target: unknown, key: string): boolean {
  return (
    typeof target === 'object' && target !== null && typeof Reflect.get(target, key) === 'function'
  );
}

function isRenderableElement(value: unknown): value is HTMLElement {
  return hasFunction(value, 'appendChild') && hasFunction(value, 'removeChild');
}

function resolveDocument(mountedElement: HTMLElement | null): Document | null {
  if (mountedElement?.ownerDocument) {
    return mountedElement.ownerDocument;
  }

  if (env.hasDocument) {
    return document;
  }

  return null;
}

function resolveRenderContainer(
  mountedElement: HTMLElement | null,
  options: PointerRenderOptions,
): HTMLElement | null {
  if (options.container && isRenderableElement(options.container)) {
    return options.container;
  }

  const doc = resolveDocument(mountedElement);
  if (typeof options.container === 'string') {
    const selected = doc?.querySelector(options.container);
    return isRenderableElement(selected) ? selected : null;
  }

  return mountedElement;
}

function resolvePointerStyle(style: PointerRenderOptions['style']): PointerStyle {
  if (style === 'spotlight' || style === 'crosshair' || style === 'dot') {
    return style;
  }

  return 'laser';
}

/**
 * Paints a beam node for the requested style. Each style positions itself at the
 * normalized point and colors with the beam's color; the node is recreated when
 * the active style changes so stale decoration never lingers.
 */
function paintPointerNode(node: HTMLElement, beam: PointerBeam, style: PointerStyle): void {
  const color = beam.color || DEFAULT_POINTER_COLOR;
  const leftPercent = `${clamp(beam.x) * 100}%`;
  const topPercent = `${clamp(beam.y) * 100}%`;

  node.setAttribute(POINTER_STYLE_ATTRIBUTE, style);
  node.style.position = 'absolute';
  node.style.pointerEvents = 'none';
  node.style.transition = 'left 90ms linear, top 90ms linear';

  if (style === 'spotlight') {
    // A soft radial dim centered on the point: full-overlay layer with a
    // transparent hole punched at the beam position.
    node.style.left = '0';
    node.style.top = '0';
    node.style.width = '100%';
    node.style.height = '100%';
    node.style.transform = 'none';
    node.style.background = `radial-gradient(circle 120px at ${leftPercent} ${topPercent}, transparent 0%, ${color}33 60%, ${color}55 100%)`;
    return;
  }

  if (style === 'crosshair') {
    node.style.left = leftPercent;
    node.style.top = topPercent;
    node.style.width = '0';
    node.style.height = '0';
    node.style.transform = 'none';
    node.style.background = 'transparent';
    // Thin horizontal and vertical lines drawn with insets relative to the point.
    node.style.boxShadow = [
      `0 0 0 0.5px ${color}`,
      `-50vw 0 0 0.5px ${color}`,
      `50vw 0 0 0.5px ${color}`,
      `0 -50vh 0 0.5px ${color}`,
      `0 50vh 0 0.5px ${color}`,
    ].join(', ');
    node.style.outline = `1px solid ${color}`;
    return;
  }

  // 'laser' and 'dot' are both a colored dot; laser adds a soft glow.
  node.style.left = leftPercent;
  node.style.top = topPercent;
  node.style.width = '14px';
  node.style.height = '14px';
  node.style.marginLeft = '-7px';
  node.style.marginTop = '-7px';
  node.style.borderRadius = '9999px';
  node.style.backgroundColor = color;
  node.style.boxShadow = style === 'laser' ? `0 0 12px 4px ${color}, 0 0 4px 1px ${color}` : 'none';
}

/**
 * Creates the laser-pointer engine. DOM observation, normalization, throttling,
 * and the built-in overlay all live here; the room supplies transport via
 * {@link PointerEngineContext} and resolves each beam's name/color from presence.
 *
 * @param context - The room callbacks that publish and subscribe to beams.
 * @param options - Optional pointer tracking configuration.
 * @returns The pointer engine bound to the room.
 */
export function createPointerEngine(
  context: PointerEngineContext,
  options: PointerOptions = {},
): PointerEngine {
  const throttleMs = Math.max(0, options.throttleMs ?? DEFAULT_THROTTLE_MS);

  let mountedElement: HTMLElement | null = null;
  let active = false;
  let lastFrame: PointerFrame | null = null;

  let lastDispatchAt: number | null = null;
  let throttleTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  let renderEnabled = false;
  let renderOptions: PointerRenderOptions = {};
  let renderContainer: HTMLElement | null = null;
  let renderRoot: HTMLElement | null = null;
  let renderSubscription: Unsubscribe | null = null;
  let containerPositionMutated = false;
  let previousContainerPosition = '';
  const renderedNodes = new Map<string, HTMLElement>();

  const publishFrame = (frame: PointerFrame): void => {
    lastFrame = frame;
    lastDispatchAt = Date.now();
    context.broadcastPointer(frame);
  };

  const clearThrottleTimer = (): void => {
    if (throttleTimer === null) {
      return;
    }

    globalThis.clearTimeout(throttleTimer);
    throttleTimer = null;
  };

  const dispatchFrame = (frame: PointerFrame): void => {
    if (!active) {
      return;
    }

    if (throttleMs === 0 || lastDispatchAt === null || Date.now() - lastDispatchAt >= throttleMs) {
      clearThrottleTimer();
      publishFrame(frame);
      return;
    }

    lastFrame = frame;

    if (throttleTimer !== null) {
      return;
    }

    const waitMs = Math.max(0, throttleMs - (Date.now() - lastDispatchAt));
    throttleTimer = globalThis.setTimeout(() => {
      throttleTimer = null;
      if (!active || lastFrame === null) {
        return;
      }

      publishFrame(lastFrame);
    }, waitMs);
  };

  const getMountedRect = (): DOMRect | DOMRectReadOnly | null => {
    if (!mountedElement || typeof mountedElement.getBoundingClientRect !== 'function') {
      return null;
    }

    return mountedElement.getBoundingClientRect();
  };

  const normalizePosition = (event: unknown): PointerFrame | null => {
    if (!isPointerPoint(event)) {
      return null;
    }

    const rect = getMountedRect();
    if (!rect) {
      return null;
    }

    const width = rect.width <= 0 ? 1 : rect.width;
    const height = rect.height <= 0 ? 1 : rect.height;

    return {
      x: clamp((event.clientX - rect.left) / width),
      y: clamp((event.clientY - rect.top) / height),
    };
  };

  const mouseMoveListener = (event: unknown): void => {
    const frame = normalizePosition(event);
    if (frame) {
      dispatchFrame(frame);
    }
  };

  const removeInputListeners = (): void => {
    if (mountedElement && hasFunction(mountedElement, 'removeEventListener')) {
      mountedElement.removeEventListener('mousemove', mouseMoveListener);
    }
  };

  const teardownRenderer = (): void => {
    renderSubscription?.();
    renderSubscription = null;

    if (renderRoot && renderContainer && renderContainer.contains(renderRoot)) {
      renderContainer.removeChild(renderRoot);
    } else {
      renderRoot?.remove();
    }

    if (containerPositionMutated && renderContainer) {
      renderContainer.style.position = previousContainerPosition;
    }

    renderRoot = null;
    renderContainer = null;
    containerPositionMutated = false;
    previousContainerPosition = '';
    renderedNodes.clear();
  };

  const renderSnapshot = (beams: PointerBeam[]): void => {
    if (!renderRoot) {
      return;
    }

    const doc = renderRoot.ownerDocument;
    const style = resolvePointerStyle(renderOptions.style);
    const seenPeerIds = new Set<string>();

    for (const beam of beams) {
      if (!beam.active) {
        continue;
      }

      seenPeerIds.add(beam.peerId);
      const existing = renderedNodes.get(beam.peerId);
      if (existing) {
        if (existing.getAttribute(POINTER_STYLE_ATTRIBUTE) !== style) {
          // Style changed at runtime: drop the stale node and rebuild it clean.
          if (renderRoot.contains(existing)) {
            renderRoot.removeChild(existing);
          }
          renderedNodes.delete(beam.peerId);
        } else {
          paintPointerNode(existing, beam, style);
          continue;
        }
      }

      const created = doc.createElement('div');
      created.setAttribute(POINTER_NODE_ATTRIBUTE, 'true');
      created.setAttribute(POINTER_PEER_ATTRIBUTE, beam.peerId);
      paintPointerNode(created, beam, style);
      renderedNodes.set(beam.peerId, created);
      renderRoot.appendChild(created);
    }

    for (const [peerId, node] of Array.from(renderedNodes.entries())) {
      if (seenPeerIds.has(peerId)) {
        continue;
      }

      if (renderRoot.contains(node)) {
        renderRoot.removeChild(node);
      } else {
        node.remove();
      }
      renderedNodes.delete(peerId);
    }
  };

  const ensureRenderer = (): void => {
    if (!renderEnabled) {
      return;
    }

    const container = resolveRenderContainer(mountedElement, renderOptions);
    const doc = resolveDocument(container ?? mountedElement);
    if (!container || !doc || typeof doc.createElement !== 'function') {
      return;
    }

    if (renderContainer !== container || !renderRoot) {
      teardownRenderer();

      renderContainer = container;
      renderRoot = doc.createElement('div');
      renderRoot.setAttribute(POINTER_ROOT_ATTRIBUTE, 'true');
      renderRoot.style.position = 'absolute';
      renderRoot.style.inset = '0';
      renderRoot.style.pointerEvents = 'none';
      renderRoot.style.overflow = 'hidden';
      renderRoot.style.zIndex = String(renderOptions.zIndex ?? 9999);

      previousContainerPosition = renderContainer.style.position;
      if (!previousContainerPosition || previousContainerPosition === 'static') {
        renderContainer.style.position = 'relative';
        containerPositionMutated = true;
      }

      renderContainer.appendChild(renderRoot);
      renderSubscription = context.subscribe((beams) => {
        renderSnapshot(beams);
      });
    }

    renderRoot.style.zIndex = String(renderOptions.zIndex ?? 9999);
    renderSnapshot(context.getBeams());
  };

  const stopStreaming = (): void => {
    if (!active) {
      return;
    }

    active = false;
    clearThrottleTimer();
    lastFrame = null;
    lastDispatchAt = null;
    context.stopPointer();
  };

  return {
    mount(element) {
      removeInputListeners();
      mountedElement = element;

      if (hasFunction(element, 'addEventListener')) {
        element.addEventListener('mousemove', mouseMoveListener);
      }

      ensureRenderer();
    },
    unmount() {
      removeInputListeners();
      stopStreaming();
      mountedElement = null;
      lastFrame = null;
      lastDispatchAt = null;
      renderEnabled = false;
      renderOptions = {};
      teardownRenderer();
    },
    activate() {
      active = true;
      // Reset the throttle so the first move after activation broadcasts promptly.
      lastFrame = null;
      lastDispatchAt = null;
    },
    deactivate() {
      stopStreaming();
    },
    subscribe(cb) {
      return context.subscribe(cb);
    },
    getAll() {
      return context.getBeams();
    },
    render(nextOptions) {
      renderEnabled = true;
      renderOptions = {
        ...renderOptions,
        ...nextOptions,
      };
      ensureRenderer();

      return () => {
        renderEnabled = false;
        renderOptions = {};
        teardownRenderer();
      };
    },
  };
}
