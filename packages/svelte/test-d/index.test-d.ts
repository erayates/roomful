import type { Action } from 'svelte/action';
import { get, type Writable } from 'svelte/store';

import { expectType } from 'tsd';

import { flock } from '..';

const adapter = flock('room-id', {
  presence: {
    role: 'editor' as const,
  },
});

expectType<'editor' | undefined>(get(adapter.presence).self.role);
expectType<'editor' | undefined>(get(adapter.presence).others[0]?.role);

const [votesStore, setVotes] = adapter.state.shared('votes', {
  no: 0,
  yes: 0,
});
expectType<Writable<{ no: number; yes: number }>>(votesStore);
expectType<
  (
    nextValue:
      | { no: number; yes: number }
      | ((current: { no: number; yes: number }) => { no: number; yes: number }),
  ) => void
>(setVotes);

const reactionChannel = adapter.events.channel<{ emoji: string }>('reaction');
expectType<string | undefined>(get(reactionChannel)?.payload.emoji);
expectType<Action<HTMLElement, undefined>>(adapter.cursors.mount);
