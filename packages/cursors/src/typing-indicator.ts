import type { Peer, PresenceData } from '@flockjs/core';
import { createElement, type CSSProperties, Fragment, type ReactElement } from 'react';

import { IndicatorStyleSheet, TYPING_DOT_PULSE_ANIMATION_NAME } from './indicator-styles';
import type { TypingIndicatorProps } from './indicator-types';
import { createTypingIndicatorText } from './indicator-utils';
import { DEFAULT_FONT_FAMILY } from './presence-utils';

export function TypingIndicator<TPresence extends PresenceData = PresenceData>(
  props: TypingIndicatorProps<TPresence>,
): ReactElement | null {
  if (props.peers.length === 0) {
    return null;
  }

  const text = createTypingIndicatorText(props.peers);
  const ariaLabel = props.ariaLabel?.trim() || text;

  return createElement(
    Fragment,
    null,
    createElement(IndicatorStyleSheet, {
      key: 'styles',
    }),
    createElement(
      'div',
      {
        'aria-label': ariaLabel,
        'aria-live': 'polite',
        'data-flockjs-typing-indicator': 'true',
        key: 'indicator',
        role: 'status',
        style: createRootStyle(),
      },
      createElement(
        'span',
        {
          key: 'label',
          style: createLabelStyle(),
        },
        text,
      ),
      createElement(
        'span',
        {
          'aria-hidden': 'true',
          key: 'dots',
          style: createDotsStyle(),
        },
        ...createTypingDots(props.peers),
      ),
    ),
  );
}

function createTypingDots<TPresence extends PresenceData>(
  peers: readonly Peer<TPresence>[],
): ReactElement[] {
  return [0, 1, 2].map((index) => {
    return createElement('span', {
      'data-flockjs-typing-dot': 'true',
      key: `${peers[0]?.id ?? 'typing'}-${index}`,
      style: createDotStyle(index),
    });
  });
}

function createRootStyle(): CSSProperties {
  return {
    alignItems: 'center',
    color: '#475569',
    display: 'inline-flex',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: '13px',
    fontWeight: 600,
    gap: '8px',
    lineHeight: 1.4,
  };
}

function createLabelStyle(): CSSProperties {
  return {
    whiteSpace: 'nowrap',
  };
}

function createDotsStyle(): CSSProperties {
  return {
    alignItems: 'flex-end',
    display: 'inline-flex',
    gap: '4px',
  };
}

function createDotStyle(index: number): CSSProperties {
  return {
    animation: `${TYPING_DOT_PULSE_ANIMATION_NAME} 1.2s ease-in-out infinite`,
    animationDelay: `${index * 0.2}s`,
    backgroundColor: 'currentColor',
    borderRadius: '9999px',
    display: 'inline-flex',
    height: '6px',
    opacity: 0.35,
    width: '6px',
  };
}
