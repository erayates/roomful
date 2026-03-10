import type { Dispatch, ReactNode, SetStateAction } from 'react';

import { expectType } from 'tsd';

import { FlockProvider, useCursors, useEvent, usePresence, useSharedState } from '..';
import type { Peer, PresenceData } from '@flockjs/core';

const provider = FlockProvider({
  children: null,
  roomId: 'room-id',
});
expectType<ReactNode>(provider);

const presence = usePresence<{ role: 'editor' | 'viewer' }>();
expectType<'editor' | 'viewer' | undefined>(presence.self.role);

const cursors = useCursors<{ tool: 'eraser' | 'pen' }>();
expectType<'eraser' | 'pen' | undefined>(cursors.cursors[0]?.tool);

const emitMessage = useEvent('message', (payload: { text: string }, from: Peer<PresenceData>) => {
  expectType<string>(payload.text);
  expectType<Peer<PresenceData>>(from);
});
expectType<(payload: { text: string }) => void>(emitMessage);

const [votes, setVotes] = useSharedState('votes', {
  initialValue: {
    no: 0,
    yes: 0,
  },
});
expectType<{ no: number; yes: number }>(votes);
expectType<Dispatch<SetStateAction<{ no: number; yes: number }>>>(setVotes);
