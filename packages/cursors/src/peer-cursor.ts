import { createElement, type CSSProperties, type ReactElement, useEffect, useState } from 'react';

import type { PeerCursorProps, PeerCursorStyle } from './peer-cursor.types';
import { renderPeerCursorMarker } from './peer-cursor-icons';

const CURSOR_MOVE_TRANSITION = 'left 120ms linear, top 120ms linear';
const LABEL_FADE_TRANSITION = 'opacity 160ms ease';
const LABEL_HIDE_DELAY_MS = 3_000;
const DEFAULT_CURSOR_COLOR = '#111827';

const VARIANT_TRANSFORMS: Record<PeerCursorStyle, string> = {
  arrow: 'translate(-18%, -14%)',
  dot: 'translate(-50%, -50%)',
  pointer: 'translate(-28%, -24%)',
};

function clampCoordinate(value: number): number {
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

function resolveColor(value: string): string {
  return value.trim() === '' ? DEFAULT_CURSOR_COLOR : value;
}

function createRootStyle(x: number, y: number, style: PeerCursorStyle): CSSProperties {
  return {
    position: 'absolute',
    left: `${clampCoordinate(x) * 100}%`,
    top: `${clampCoordinate(y) * 100}%`,
    transform: VARIANT_TRANSFORMS[style],
    transition: CURSOR_MOVE_TRANSITION,
    pointerEvents: 'none',
    userSelect: 'none',
    willChange: 'left, top',
    zIndex: 1,
  };
}

function createContentStyle(): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  };
}

function createMarkerWrapStyle(): CSSProperties {
  return {
    display: 'inline-flex',
    flex: '0 0 auto',
    lineHeight: 0,
  };
}

function createLabelStyle(color: string, isVisible: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    borderRadius: '9999px',
    backgroundColor: color,
    color: '#ffffff',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.2)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1,
    opacity: isVisible ? 1 : 0,
    transition: LABEL_FADE_TRANSITION,
    whiteSpace: 'nowrap',
  };
}

/**
 * Renders a remote peer cursor.
 *
 * @param props - The cursor position and styling props.
 * @returns The rendered peer cursor.
 */
export function PeerCursor(props: PeerCursorProps): ReactElement {
  const { x, y, name, color, idle, style } = props;
  const [isLabelVisible, setIsLabelVisible] = useState(true);
  const resolvedColor = resolveColor(color);

  useEffect(() => {
    if (!idle) {
      setIsLabelVisible(true);
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setIsLabelVisible(false);
    }, LABEL_HIDE_DELAY_MS);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [idle]);

  return createElement(
    'div',
    {
      'aria-hidden': 'true',
      'data-roomful-peer-cursor': 'true',
      'data-roomful-peer-cursor-color': resolvedColor,
      'data-roomful-peer-cursor-style': style,
      style: createRootStyle(x, y, style),
    },
    createElement(
      'div',
      {
        style: createContentStyle(),
      },
      createElement(
        'span',
        {
          style: createMarkerWrapStyle(),
        },
        renderPeerCursorMarker(style, resolvedColor),
      ),
      createElement(
        'span',
        {
          'data-roomful-peer-cursor-label': 'true',
          'data-roomful-peer-cursor-label-color': resolvedColor,
          style: createLabelStyle(resolvedColor, isLabelVisible),
        },
        name,
      ),
    ),
  );
}
