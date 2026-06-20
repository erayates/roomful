import { RoomfulProvider } from '@roomful/react';
import { createElement, Fragment, type ReactElement, type ReactNode, useId } from 'react';

import { createPresencePeers, createStoryRoomId, toStoryPresence } from './story-fixtures';

export interface PresenceStoryHarnessProps {
  children?: ReactNode;
  peerCount: number;
}

export function PresenceStoryHarness(props: PresenceStoryHarnessProps): ReactElement {
  const reactId = useId();
  const roomId = createStoryRoomId('cursors-story', reactId);
  const peers = createPresencePeers(props.peerCount);
  const self = peers[0];

  if (!self) {
    return createElement(Fragment, null);
  }

  return createElement(
    Fragment,
    null,
    ...peers.slice(1).map((peer) => {
      return createElement(RoomfulProvider, {
        key: peer.id,
        roomId,
        transport: 'broadcast',
        presence: toStoryPresence(peer),
      });
    }),
    createElement(
      RoomfulProvider,
      {
        roomId,
        transport: 'broadcast',
        presence: toStoryPresence(self),
      },
      props.children,
    ),
  );
}
