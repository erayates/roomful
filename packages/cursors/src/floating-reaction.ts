import {
  createElement,
  type CSSProperties,
  Fragment,
  type ReactElement,
  useEffect,
  useState,
} from 'react';

const DEFAULT_EMOJI_SIZE = 32;
const DEFAULT_DURATION_MS = 1500;
const FLOATING_REACTION_ANIMATION_NAME = 'cahoots-floating-reaction-float';
const FLOATING_REACTION_STYLE = `
  @keyframes ${FLOATING_REACTION_ANIMATION_NAME} {
    0% {
      opacity: 1;
      transform: translate(-50%, -50%) translateY(0);
    }

    60% {
      opacity: 1;
    }

    100% {
      opacity: 0;
      transform: translate(-50%, -50%) translateY(-42px) scale(1.05);
    }
  }
`;

/**
 * Configures the floating reaction overlay.
 */
export interface FloatingReactionProps {
  /**
   * Supplies the emoji or text glyph to render.
   */
  emoji: string;

  /**
   * Supplies the normalized horizontal coordinate.
   */
  x: number;

  /**
   * Supplies the normalized vertical coordinate.
   */
  y: number;

  /**
   * Overrides the rendered emoji size in pixels.
   */
  size?: number;

  /**
   * Overrides the animation duration in milliseconds.
   */
  durationMs?: number;

  /**
   * Delays the animation start in milliseconds.
   */
  delayMs?: number;

  /**
   * Runs after the animation completes.
   */
  onAnimationEnd?: () => void;
}

function FloatingReactionStyleSheet(): ReactElement {
  return createElement('style', {
    'data-cahoots-floating-reaction-styles': 'true',
    key: 'floating-reaction-styles',
    children: FLOATING_REACTION_STYLE,
  });
}

function clampNormalizedCoordinate(value: number): number {
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

function createRootStyle(
  left: string,
  top: string,
  size: number,
  duration: number,
  delay: number,
): CSSProperties {
  return {
    animation: `${FLOATING_REACTION_ANIMATION_NAME} ${duration}ms ease-out forwards`,
    animationDelay: `${delay}ms`,
    display: 'inline-flex',
    fontSize: `${size}px`,
    height: `${size}px`,
    justifyContent: 'center',
    left,
    lineHeight: 1,
    padding: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top,
    transform: 'translate(-50%, -50%)',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    width: `${size}px`,
    willChange: 'transform, opacity',
    zIndex: 1,
  };
}

/**
 * Renders a transient reaction that floats upward and fades out.
 *
 * @param props - The floating reaction configuration.
 * @returns The rendered floating reaction, or `null` after the animation completes.
 */
export function FloatingReaction(props: FloatingReactionProps): ReactElement | null {
  const { emoji, x, y, size = DEFAULT_EMOJI_SIZE, durationMs, delayMs, onAnimationEnd } = props;

  const [isVisible, setIsVisible] = useState(true);
  const duration = Math.max(0, durationMs ?? DEFAULT_DURATION_MS);
  const delay = Math.max(0, delayMs ?? 0);
  const totalDuration = duration + delay;
  const resolvedSize = Math.max(8, size);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setIsVisible(false);
      onAnimationEnd?.();
    }, totalDuration);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [totalDuration, onAnimationEnd]);

  if (!isVisible) {
    return null;
  }

  const resolvedX = clampNormalizedCoordinate(x);
  const resolvedY = clampNormalizedCoordinate(y);
  const left = `${resolvedX * 100}%`;
  const top = `${resolvedY * 100}%`;

  return createElement(
    Fragment,
    null,
    createElement(FloatingReactionStyleSheet, null),
    createElement(
      'span',
      {
        'aria-hidden': 'true',
        'data-cahoots-floating-reaction': 'true',
        'data-cahoots-floating-reaction-emoji': emoji,
        style: createRootStyle(left, top, resolvedSize, duration, delay),
      },
      emoji,
    ),
  );
}
