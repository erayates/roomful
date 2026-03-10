import type { ReactElement } from 'react';

import { expectAssignable, expectType } from 'tsd';

import {
  CollaborationBadge,
  type CollaborationBadgeProps,
  FloatingReaction,
  type FloatingReactionProps,
  LiveIndicator,
  type LiveIndicatorProps,
  PeerCursor,
  type PeerCursorProps,
  PresenceAvatars,
  type PresenceAvatarsProps,
  PresenceBar,
  type PresenceBarProps,
  type PresenceSize,
  SelectionHighlight,
  type SelectionHighlightProps,
  TypingIndicator,
  type TypingIndicatorProps,
} from '..';
import type { Peer } from '@flockjs/core';

const peer = {
  id: 'peer-1',
  joinedAt: 0,
  lastSeen: 0,
  name: 'Ada',
  role: 'editor' as const,
} satisfies Peer<{ role: 'editor' }>;

expectAssignable<CollaborationBadgeProps<{ role: 'editor' }>>({
  peer,
});
expectType<ReactElement>(CollaborationBadge({ peer }));

const floatingReactionProps: FloatingReactionProps = {
  emoji: '🔥',
  x: 0.5,
  y: 0.25,
};
expectType<ReactElement | null>(FloatingReaction(floatingReactionProps));

const liveIndicatorProps: LiveIndicatorProps = {
  color: '#22c55e',
};
expectType<ReactElement>(LiveIndicator(liveIndicatorProps));

const peerCursorProps: PeerCursorProps = {
  color: '#111827',
  idle: false,
  name: 'Ada',
  style: 'pointer',
  x: 0.4,
  y: 0.2,
};
expectType<ReactElement>(PeerCursor(peerCursorProps));

const presenceAvatarsProps: PresenceAvatarsProps<{ role: 'editor' }> = {
  maxVisible: 3,
  size: 'sm',
};
expectAssignable<PresenceAvatarsProps<{ role: 'editor' }>>(presenceAvatarsProps);
expectType<ReactElement>(PresenceAvatars(presenceAvatarsProps));

const presenceBarProps: PresenceBarProps<{ role: 'editor' }> = {
  maxVisible: 3,
  showNames: true,
};
expectAssignable<PresenceBarProps<{ role: 'editor' }>>(presenceBarProps);
expectType<ReactElement>(PresenceBar(presenceBarProps));
expectAssignable<PresenceSize>('md');

const selectionHighlightProps: SelectionHighlightProps<{ role: 'editor' }> = {
  peer,
  selection: {
    elementId: 'editor',
    from: 0,
    to: 4,
  },
};
expectType<null>(SelectionHighlight(selectionHighlightProps));

const typingIndicatorProps: TypingIndicatorProps<{ role: 'editor' }> = {
  peers: [peer],
};
expectType<ReactElement | null>(TypingIndicator(typingIndicatorProps));
