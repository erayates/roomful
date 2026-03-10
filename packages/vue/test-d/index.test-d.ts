import type { ShallowRef } from 'vue';

import { expectType } from 'tsd';

import {
  type ReadonlyRef,
  type SharedStateSetter,
  useCursors,
  useEvent,
  usePresence,
  useSharedState,
} from '..';
import type { Peer, PresenceData } from '@flockjs/core';

const presence = usePresence<{ role: 'editor' | 'viewer' }>();
expectType<'editor' | 'viewer' | undefined>(presence.self.value.role);

const cursors = useCursors<{ tool: 'eraser' | 'pen' }>();
expectType<HTMLElement | null>(cursors.ref.value);
expectType<'eraser' | 'pen' | undefined>(cursors.cursors.value[0]?.tool);

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
expectType<ReadonlyRef<{ no: number; yes: number }>>(votes);
expectType<SharedStateSetter<{ no: number; yes: number }>>(setVotes);
expectType<Readonly<ShallowRef<{ no: number; yes: number }>>>(votes);
