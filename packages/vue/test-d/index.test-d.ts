import type { Plugin, ShallowRef } from 'vue';

import { expectAssignable, expectType } from 'tsd';

import {
  CahootsPlugin,
  type CahootsPluginOptions,
  type ReadonlyRef,
  type SharedStateSetter,
  type UseAwarenessResult,
  useAwareness,
  useCursors,
  useEvent,
  usePresence,
  useSharedState,
} from '..';
import type { Peer, PresenceData } from '@cahoots/core';

const presence = usePresence<{ role: 'editor' | 'viewer' }>();
expectType<'editor' | 'viewer' | undefined>(presence.self.value.role);

const pluginOptions = {
  presence: {
    role: 'editor' as const,
  },
  roomId: 'room-id',
} satisfies CahootsPluginOptions<{ role: 'editor' }>;
expectType<string>(pluginOptions.roomId);
expectAssignable<Plugin>(CahootsPlugin);

const cursors = useCursors<{ tool: 'eraser' | 'pen' }>();
expectType<HTMLElement | null>(cursors.ref.value);
expectType<'eraser' | 'pen' | undefined>(cursors.cursors.value[0]?.tool);

const emitMessage = useEvent('message', (payload: { text: string }, from: Peer<PresenceData>) => {
  expectType<string>(payload.text);
  expectType<Peer<PresenceData>>(from);
});
expectType<(payload: { text: string }) => void>(emitMessage);

const awareness = useAwareness();
expectType<UseAwarenessResult>(awareness);
expectType<boolean | undefined>(awareness.others.value[0]?.typing);

const [votes, setVotes] = useSharedState('votes', {
  initialValue: {
    no: 0,
    yes: 0,
  },
});
expectType<ReadonlyRef<{ no: number; yes: number }>>(votes);
expectType<SharedStateSetter<{ no: number; yes: number }>>(setVotes);
expectType<Readonly<ShallowRef<{ no: number; yes: number }>>>(votes);
setVotes((current) => {
  expectType<{ no: number; yes: number }>(current);
  return current;
});
