import { createElement, type ReactElement } from 'react';

export const LIVE_INDICATOR_PULSE_ANIMATION_NAME = 'cahootsLiveIndicatorPulse';
export const TYPING_DOT_PULSE_ANIMATION_NAME = 'cahootsTypingDotPulse';

const INDICATOR_KEYFRAMES = `
@keyframes ${LIVE_INDICATOR_PULSE_ANIMATION_NAME} {
  0% {
    opacity: 0.75;
    transform: scale(0.7);
  }

  70% {
    opacity: 0;
    transform: scale(1.9);
  }

  100% {
    opacity: 0;
    transform: scale(1.9);
  }
}

@keyframes ${TYPING_DOT_PULSE_ANIMATION_NAME} {
  0%, 80%, 100% {
    opacity: 0.35;
    transform: translateY(0) scale(0.85);
  }

  40% {
    opacity: 1;
    transform: translateY(-2px) scale(1);
  }
}
`;

export function IndicatorStyleSheet(): ReactElement {
  return createElement(
    'style',
    {
      'data-cahoots-indicator-styles': 'true',
    },
    INDICATOR_KEYFRAMES,
  );
}
