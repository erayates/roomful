import type { Peer, PresenceData } from '@flockjs/core';
import { createElement, type CSSProperties, type ReactElement } from 'react';

import type { PresenceSizeTokens } from './presence-types';
import {
  DEFAULT_FONT_FAMILY,
  resolvePeerAvatar,
  resolvePeerColor,
  resolvePeerInitials,
} from './presence-utils';

interface PresenceAvatarProps<TPresence extends PresenceData = PresenceData> {
  peer: Peer<TPresence>;
  sizeTokens: PresenceSizeTokens;
}

export function PresenceAvatar<TPresence extends PresenceData = PresenceData>(
  props: PresenceAvatarProps<TPresence>,
): ReactElement {
  const { peer, sizeTokens } = props;
  const avatarUrl = resolvePeerAvatar(peer);
  const backgroundColor = resolvePeerColor(peer);

  return createElement(
    'span',
    {
      'data-flockjs-presence-avatar': 'true',
      style: createAvatarShellStyle(sizeTokens, backgroundColor),
    },
    avatarUrl
      ? createElement('img', {
          alt: '',
          'data-flockjs-presence-avatar-image': 'true',
          draggable: false,
          src: avatarUrl,
          style: createAvatarImageStyle(),
        })
      : createElement(
          'span',
          {
            'data-flockjs-presence-avatar-fallback': 'true',
            style: createAvatarInitialsStyle(sizeTokens),
          },
          resolvePeerInitials(peer),
        ),
  );
}

function createAvatarShellStyle(
  sizeTokens: PresenceSizeTokens,
  backgroundColor: string,
): CSSProperties {
  return {
    alignItems: 'center',
    backgroundColor,
    borderRadius: '9999px',
    color: '#ffffff',
    display: 'inline-flex',
    flex: '0 0 auto',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: `${sizeTokens.initialsFontSize}px`,
    fontWeight: 700,
    height: `${sizeTokens.avatarSize}px`,
    justifyContent: 'center',
    letterSpacing: '0.02em',
    overflow: 'hidden',
    textTransform: 'uppercase',
    userSelect: 'none',
    width: `${sizeTokens.avatarSize}px`,
  };
}

function createAvatarInitialsStyle(sizeTokens: PresenceSizeTokens): CSSProperties {
  return {
    display: 'inline-flex',
    fontSize: `${sizeTokens.initialsFontSize}px`,
    fontWeight: 700,
    lineHeight: 1,
  };
}

function createAvatarImageStyle(): CSSProperties {
  return {
    display: 'block',
    height: '100%',
    objectFit: 'cover',
    width: '100%',
  };
}
