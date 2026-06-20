import { createElement, type CSSProperties, Fragment, type ReactElement } from 'react';

import { IndicatorStyleSheet, LIVE_INDICATOR_PULSE_ANIMATION_NAME } from './indicator-styles';
import type { LiveIndicatorProps } from './indicator-types';
import {
  DEFAULT_LIVE_INDICATOR_COLOR,
  DEFAULT_LIVE_INDICATOR_SIZE,
  sanitizeIndicatorColor,
  sanitizeIndicatorSize,
} from './indicator-utils';

/**
 * Renders an animated live-activity indicator.
 *
 * @param props - The live indicator configuration.
 * @returns The rendered live indicator.
 */
export function LiveIndicator(props: LiveIndicatorProps): ReactElement {
  const color = sanitizeIndicatorColor(props.color, DEFAULT_LIVE_INDICATOR_COLOR);
  const size = sanitizeIndicatorSize(props.size, DEFAULT_LIVE_INDICATOR_SIZE);
  const ariaLabel = props.ariaLabel?.trim() || 'Live activity';

  return createElement(
    Fragment,
    null,
    createElement(IndicatorStyleSheet, {
      key: 'styles',
    }),
    createElement(
      'span',
      {
        'aria-label': ariaLabel,
        'data-roomful-live-indicator': 'true',
        key: 'indicator',
        role: 'img',
        style: createRootStyle(size),
      },
      createElement('span', {
        'aria-hidden': 'true',
        'data-roomful-live-indicator-pulse': 'true',
        key: 'pulse',
        style: createPulseStyle(color),
      }),
      createElement('span', {
        'aria-hidden': 'true',
        'data-roomful-live-indicator-core': 'true',
        key: 'core',
        style: createCoreStyle(color),
      }),
    ),
  );
}

function createRootStyle(size: number): CSSProperties {
  return {
    display: 'inline-flex',
    flex: '0 0 auto',
    height: `${size}px`,
    position: 'relative',
    verticalAlign: 'middle',
    width: `${size}px`,
  };
}

function createPulseStyle(color: string): CSSProperties {
  return {
    animation: `${LIVE_INDICATOR_PULSE_ANIMATION_NAME} 1.6s ease-out infinite`,
    backgroundColor: color,
    borderRadius: '9999px',
    inset: 0,
    opacity: 0.7,
    position: 'absolute',
  };
}

function createCoreStyle(color: string): CSSProperties {
  return {
    backgroundColor: color,
    borderRadius: '9999px',
    boxShadow: `0 0 0 1px ${color}`,
    inset: '25%',
    position: 'absolute',
  };
}
