import type { Dispatch, ReactNode, SetStateAction } from 'react';

import { expectType } from 'tsd';

import {
  createReactHealth,
  RoomfulProvider,
  type RoomfulProviderProps,
  type ReactHealth,
  type UseAwarenessResult,
  useAwareness,
  useConnectionStatus,
  useCursors,
  useEvent,
  usePeers,
  usePresence,
  useRoom,
  useSharedState,
} from '..';
import type { Peer, PresenceData, Room, RoomStatus } from '@roomful/core';

const provider = RoomfulProvider({
  children: null,
  roomId: 'room-id',
});
expectType<ReactNode>(provider);

const providerProps = {
  onDisconnect(payload) {
    expectType<string | undefined>(payload.reason);
  },
  onError(error) {
    expectType<string>(error.message);
  },
  presence: {
    role: 'editor' as const,
  },
  roomId: 'room-id',
} satisfies RoomfulProviderProps<{ role: 'editor' }>;
expectType<string>(providerProps.roomId);

const health = createReactHealth();
expectType<ReactHealth>(health);
expectType<'@roomful/core'>(health.dependencies.core.packageName);

const room = useRoom<{ role: 'editor' | 'viewer' }>();
expectType<Room<{ role: 'editor' | 'viewer' }>>(room);

const presence = usePresence<{ role: 'editor' | 'viewer' }>();
expectType<'editor' | 'viewer' | undefined>(presence.self.role);

const cursors = useCursors<{ tool: 'eraser' | 'pen' }>();
expectType<'eraser' | 'pen' | undefined>(cursors.cursors[0]?.tool);

const emitMessage = useEvent('message', (payload: { text: string }, from: Peer<PresenceData>) => {
  expectType<string>(payload.text);
  expectType<Peer<PresenceData>>(from);
});
expectType<(payload: { text: string }) => void>(emitMessage);

const awareness = useAwareness();
expectType<UseAwarenessResult>(awareness);
expectType<boolean | undefined>(awareness.others[0]?.typing);

const peers = usePeers<{ role: 'editor' | 'viewer' }>();
expectType<Peer<{ role: 'editor' | 'viewer' }>[]>(peers);

const connectionStatus = useConnectionStatus();
expectType<RoomStatus>(connectionStatus);

const [votes, setVotes] = useSharedState('votes', {
  initialValue: {
    no: 0,
    yes: 0,
  },
});
expectType<{ no: number; yes: number }>(votes);
expectType<Dispatch<SetStateAction<{ no: number; yes: number }>>>(setVotes);
setVotes((current) => {
  expectType<{ no: number; yes: number }>(current);
  return current;
});
