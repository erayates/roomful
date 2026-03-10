import type { ReactElement } from 'react';
import { createElement } from 'react';

import type { PeerCursorStyle } from './peer-cursor.types';

interface MarkerDefinition {
  height: number;
  viewBox: string;
  width: number;
  children: ReactElement[];
}

function createSvgChild(
  type: 'circle' | 'path',
  props: Record<string, string>,
): ReactElement {
  return createElement(type, props);
}

function getMarkerDefinition(style: PeerCursorStyle, color: string): MarkerDefinition {
  if (style === 'dot') {
    return {
      width: 18,
      height: 18,
      viewBox: '0 0 18 18',
      children: [
        createSvgChild('circle', {
          cx: '9',
          cy: '9',
          r: '5',
          fill: color,
          stroke: '#ffffff',
          strokeWidth: '2',
        }),
      ],
    };
  }

  if (style === 'pointer') {
    return {
      width: 18,
      height: 20,
      viewBox: '0 0 18 20',
      children: [
        createSvgChild('path', {
          d: 'M9 1C5.134 1 2 4.134 2 8c0 5.55 7 11 7 11s7-5.45 7-11c0-3.866-3.134-7-7-7Zm0 10.2A3.2 3.2 0 1 1 9 4.8a3.2 3.2 0 0 1 0 6.4Z',
          fill: color,
          stroke: '#ffffff',
          strokeWidth: '1.5',
          strokeLinejoin: 'round',
        }),
      ],
    };
  }

  return {
    width: 20,
    height: 24,
    viewBox: '0 0 24 24',
    children: [
      createSvgChild('path', {
        d: 'M2 2L18 12L10.5 13.5L14 22L9 23L5.5 15L1.5 19L2 2Z',
        fill: color,
        stroke: '#ffffff',
        strokeWidth: '1.5',
        strokeLinejoin: 'round',
      }),
    ],
  };
}

export function renderPeerCursorMarker(
  style: PeerCursorStyle,
  color: string,
): ReactElement {
  const definition = getMarkerDefinition(style, color);

  return createElement(
    'svg',
    {
      'aria-hidden': 'true',
      'data-flockjs-peer-cursor-marker': 'true',
      'data-flockjs-peer-cursor-marker-style': style,
      fill: 'none',
      height: String(definition.height),
      style: {
        display: 'block',
        filter: 'drop-shadow(0 2px 4px rgba(15, 23, 42, 0.2))',
        overflow: 'visible',
      },
      viewBox: definition.viewBox,
      width: String(definition.width),
      xmlns: 'http://www.w3.org/2000/svg',
    },
    ...definition.children,
  );
}
