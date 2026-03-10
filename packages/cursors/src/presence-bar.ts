import type { Peer, PresenceData } from '@flockjs/core';
import { usePresence } from '@flockjs/react';
import { createElement, type CSSProperties, type ReactElement } from 'react';

import { useAnimatedPresencePeers } from './presence-animated-list';
import { PresenceAvatar } from './presence-avatar';
import type {
  PresenceAnimationPhase,
  PresenceBarProps,
  PresenceSizeTokens,
} from './presence-types';
import {
  createPeerListTitle,
  DEFAULT_FONT_FAMILY,
  getPresenceSizeTokens,
  PRESENCE_ANIMATION_DURATION_MS,
  resolvePeerDisplayName,
  sanitizeMaxVisible,
} from './presence-utils';

/**
 * Renders a labeled presence list for the current room.
 *
 * @typeParam TPresence - The peer presence shape.
 * @param props - The presence bar configuration.
 * @returns The rendered presence bar.
 */
export function PresenceBar<TPresence extends PresenceData = PresenceData>(
  props: PresenceBarProps<TPresence>,
): ReactElement {
  const { all } = usePresence<TPresence>();
  const maxVisible = sanitizeMaxVisible(props.maxVisible);
  const showNames = props.showNames ?? true;
  const sizeTokens = getPresenceSizeTokens(props.size);
  const visiblePeers = all.slice(0, maxVisible);
  const hiddenPeers = all.slice(maxVisible);
  const animatedPeers = useAnimatedPresencePeers(visiblePeers);

  return createElement(
    'div',
    {
      'data-flockjs-presence-bar': 'true',
      style: createRootStyle(sizeTokens),
    },
    ...animatedPeers.map((item) => {
      return renderPeerChip(item.peer, item.phase, sizeTokens, showNames, props.onUserClick);
    }),
    hiddenPeers.length > 0
      ? createElement(
          'span',
          {
            'data-flockjs-presence-overflow': 'true',
            style: createOverflowChipStyle(sizeTokens),
            title: createPeerListTitle(hiddenPeers),
          },
          `+${hiddenPeers.length}`,
        )
      : null,
  );
}

function renderPeerChip<TPresence extends PresenceData>(
  peer: Peer<TPresence>,
  phase: PresenceAnimationPhase,
  sizeTokens: PresenceSizeTokens,
  showNames: boolean,
  onUserClick: PresenceBarProps<TPresence>['onUserClick'],
): ReactElement {
  const displayName = resolvePeerDisplayName(peer);
  const commonProps = {
    'aria-label': displayName,
    'data-flockjs-presence-peer': peer.id,
    'data-flockjs-presence-phase': phase,
    style: createPeerChipStyle(sizeTokens, phase, showNames, onUserClick !== undefined),
    title: displayName,
  };

  const children = [
    createElement(PresenceAvatar, {
      key: `${peer.id}-avatar`,
      peer,
      sizeTokens,
    }),
    showNames
      ? createElement(
          'span',
          {
            key: `${peer.id}-label`,
            style: createLabelStyle(sizeTokens),
          },
          displayName,
        )
      : null,
  ];

  if (onUserClick) {
    return createElement(
      'button',
      {
        ...commonProps,
        key: peer.id,
        onClick: () => {
          onUserClick(peer);
        },
        type: 'button',
      },
      ...children,
    );
  }

  return createElement(
    'div',
    {
      ...commonProps,
      key: peer.id,
    },
    ...children,
  );
}

function createRootStyle(sizeTokens: PresenceSizeTokens): CSSProperties {
  return {
    alignItems: 'center',
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: `${sizeTokens.chipGap}px`,
  };
}

function createPeerChipStyle(
  sizeTokens: PresenceSizeTokens,
  phase: PresenceAnimationPhase,
  showNames: boolean,
  isClickable: boolean,
): CSSProperties {
  return {
    alignItems: 'center',
    appearance: 'none',
    backgroundColor: '#ffffff',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: '9999px',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
    color: '#0f172a',
    cursor: isClickable ? 'pointer' : 'default',
    display: 'inline-flex',
    gap: showNames ? `${Math.max(6, sizeTokens.chipGap - 2)}px` : '0px',
    height: `${sizeTokens.chipHeight}px`,
    justifyContent: 'center',
    opacity: phase === 'entered' ? 1 : 0,
    padding: showNames
      ? `0 ${sizeTokens.chipPaddingX}px 0 ${Math.max(4, sizeTokens.chipPaddingX - 6)}px`
      : `${Math.max(3, sizeTokens.chipPaddingX - 5)}px`,
    transform: phaseTransform(phase),
    transition: `opacity ${PRESENCE_ANIMATION_DURATION_MS}ms ease, transform ${PRESENCE_ANIMATION_DURATION_MS}ms ease`,
    whiteSpace: 'nowrap',
  };
}

function createLabelStyle(sizeTokens: PresenceSizeTokens): CSSProperties {
  return {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: `${sizeTokens.fontSize}px`,
    fontWeight: 600,
    lineHeight: 1.2,
  };
}

function createOverflowChipStyle(sizeTokens: PresenceSizeTokens): CSSProperties {
  return {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: '9999px',
    color: '#475569',
    display: 'inline-flex',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: `${sizeTokens.fontSize}px`,
    fontWeight: 700,
    height: `${sizeTokens.chipHeight}px`,
    justifyContent: 'center',
    minWidth: `${sizeTokens.chipHeight}px`,
    padding: `0 ${Math.max(8, sizeTokens.chipPaddingX)}px`,
    whiteSpace: 'nowrap',
  };
}

function phaseTransform(phase: PresenceAnimationPhase): string {
  if (phase === 'entering') {
    return 'translateY(-4px) scale(0.96)';
  }

  if (phase === 'exiting') {
    return 'translateY(4px) scale(0.96)';
  }

  return 'translateY(0) scale(1)';
}
