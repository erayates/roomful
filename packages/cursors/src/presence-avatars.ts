import type { Peer, PresenceData } from '@flockjs/core';
import { usePresence } from '@flockjs/react';
import { createElement, type CSSProperties, type ReactElement } from 'react';

import { useAnimatedPresencePeers } from './presence-animated-list';
import { PresenceAvatar } from './presence-avatar';
import type {
  PresenceAnimationPhase,
  PresenceAvatarsProps,
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

export function PresenceAvatars<TPresence extends PresenceData = PresenceData>(
  props: PresenceAvatarsProps<TPresence>,
): ReactElement {
  const { all } = usePresence<TPresence>();
  const maxVisible = sanitizeMaxVisible(props.maxVisible);
  const sizeTokens = getPresenceSizeTokens(props.size);
  const visiblePeers = all.slice(0, maxVisible);
  const hiddenPeers = all.slice(maxVisible);
  const animatedPeers = useAnimatedPresencePeers(visiblePeers);

  return createElement(
    'div',
    {
      'data-flockjs-presence-avatars': 'true',
      style: createRootStyle(),
    },
    ...animatedPeers.map((item, index) => {
      return renderAvatarItem(item.peer, item.phase, sizeTokens, index, props.onUserClick);
    }),
    hiddenPeers.length > 0
      ? createElement(
          'span',
          {
            'data-flockjs-presence-overflow': 'true',
            style: createOverflowBadgeStyle(sizeTokens, animatedPeers.length > 0),
            title: createPeerListTitle(hiddenPeers),
          },
          `+${hiddenPeers.length}`,
        )
      : null,
  );
}

function renderAvatarItem<TPresence extends PresenceData>(
  peer: Peer<TPresence>,
  phase: PresenceAnimationPhase,
  sizeTokens: PresenceSizeTokens,
  index: number,
  onUserClick: PresenceAvatarsProps<TPresence>['onUserClick'],
): ReactElement {
  const displayName = resolvePeerDisplayName(peer);
  const commonProps = {
    'aria-label': displayName,
    'data-flockjs-presence-peer': peer.id,
    'data-flockjs-presence-phase': phase,
    style: createAvatarItemStyle(sizeTokens, phase, index > 0, onUserClick !== undefined, index),
    title: displayName,
  };

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
      createElement(PresenceAvatar, {
        peer,
        sizeTokens,
      }),
    );
  }

  return createElement(
    'div',
    {
      ...commonProps,
      key: peer.id,
    },
    createElement(PresenceAvatar, {
      peer,
      sizeTokens,
    }),
  );
}

function createRootStyle(): CSSProperties {
  return {
    alignItems: 'center',
    display: 'inline-flex',
  };
}

function createAvatarItemStyle(
  sizeTokens: PresenceSizeTokens,
  phase: PresenceAnimationPhase,
  shouldOverlap: boolean,
  isClickable: boolean,
  index: number,
): CSSProperties {
  return {
    alignItems: 'center',
    appearance: 'none',
    background: 'transparent',
    border: '0',
    cursor: isClickable ? 'pointer' : 'default',
    display: 'inline-flex',
    marginLeft: shouldOverlap ? `-${sizeTokens.overlapOffset}px` : '0px',
    opacity: phase === 'entered' ? 1 : 0,
    padding: '0px',
    position: 'relative',
    transform: phaseScale(phase),
    transition: `opacity ${PRESENCE_ANIMATION_DURATION_MS}ms ease, transform ${PRESENCE_ANIMATION_DURATION_MS}ms ease`,
    zIndex: index + 1,
  };
}

function createOverflowBadgeStyle(
  sizeTokens: PresenceSizeTokens,
  shouldOverlap: boolean,
): CSSProperties {
  return {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    border: `${sizeTokens.borderWidth}px solid #ffffff`,
    borderRadius: '9999px',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.18)',
    color: '#ffffff',
    display: 'inline-flex',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: `${sizeTokens.fontSize}px`,
    fontWeight: 700,
    height: `${sizeTokens.avatarSize}px`,
    justifyContent: 'center',
    marginLeft: shouldOverlap ? `-${sizeTokens.overlapOffset}px` : '0px',
    minWidth: `${sizeTokens.avatarSize}px`,
    padding: `0 ${Math.max(6, sizeTokens.chipPaddingX - 2)}px`,
    position: 'relative',
    zIndex: 999,
  };
}

function phaseScale(phase: PresenceAnimationPhase): string {
  if (phase === 'entering') {
    return 'scale(0.88)';
  }

  if (phase === 'exiting') {
    return 'scale(1.08)';
  }

  return 'scale(1)';
}
