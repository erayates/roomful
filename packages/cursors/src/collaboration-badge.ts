import type { PresenceData } from '@flockjs/core';
import { createElement, type CSSProperties, type ReactElement } from 'react';

import type { CollaborationBadgePosition, CollaborationBadgeProps } from './collaboration-badge.types';
import { DEFAULT_FONT_FAMILY, resolvePeerColor, resolvePeerDisplayName } from './presence-utils';

const DEFAULT_BADGE_OFFSET = '0px';

export function CollaborationBadge<TPresence extends PresenceData = PresenceData>(
  props: CollaborationBadgeProps<TPresence>,
): ReactElement {
  const { peer, position } = props;
  const resolvedColor = resolvePeerColor(peer);
  const displayName = resolvePeerDisplayName(peer);

  return createElement(
    'div',
    {
      'aria-label': `${displayName} is editing`,
      'data-flockjs-collaboration-badge': 'true',
      'data-flockjs-collaboration-badge-color': resolvedColor,
      'data-flockjs-collaboration-badge-peer': peer.id,
      style: createRootStyle(position, resolvedColor),
    },
    createElement('span', {
      'aria-hidden': 'true',
      'data-flockjs-collaboration-badge-dot': 'true',
      style: createDotStyle(),
    }),
    createElement(
      'span',
      {
        style: createLabelStyle(),
      },
      displayName,
    ),
  );
}

function createRootStyle(
  position: CollaborationBadgePosition | undefined,
  color: string,
): CSSProperties {
  const resolvedPosition = resolvePosition(position);

  return {
    alignItems: 'center',
    backgroundColor: color,
    borderRadius: '9999px',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)',
    color: '#ffffff',
    display: 'inline-flex',
    gap: '6px',
    maxWidth: '100%',
    padding: '4px 8px',
    pointerEvents: 'none',
    position: 'absolute',
    whiteSpace: 'nowrap',
    zIndex: 2,
    ...resolvedPosition,
  };
}

function createDotStyle(): CSSProperties {
  return {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: '9999px',
    display: 'inline-flex',
    flex: '0 0 auto',
    height: '6px',
    width: '6px',
  };
}

function createLabelStyle(): CSSProperties {
  return {
    display: 'inline-flex',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

function resolvePosition(position: CollaborationBadgePosition | undefined): CSSProperties {
  const top = toCssLength(position?.top);
  const right = toCssLength(position?.right);
  const bottom = toCssLength(position?.bottom);
  const left = toCssLength(position?.left);

  return {
    ...(bottom !== undefined ? { bottom } : {}),
    ...(left !== undefined ? { left } : {}),
    ...(right !== undefined || left === undefined
      ? { right: right ?? DEFAULT_BADGE_OFFSET }
      : {}),
    ...(top !== undefined || bottom === undefined
      ? { top: top ?? DEFAULT_BADGE_OFFSET }
      : {}),
  };
}

function toCssLength(value: number | string | undefined): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return undefined;
    }

    return `${value}px`;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
