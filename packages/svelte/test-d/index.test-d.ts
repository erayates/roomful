import type { RoomfulError, RoomStatus, ViewportState } from '@roomful/core';
import type { Action } from 'svelte/action';
import { get, type Readable, type Writable } from 'svelte/store';

import { expectType } from 'tsd';

import { roomful, type RoomfulAdapter } from '..';

const adapter = roomful('room-id', {
  onConnect() {
    return undefined;
  },
  onDisconnect(payload) {
    expectType<string | undefined>(payload.reason);
  },
  onError(error: RoomfulError) {
    expectType<string>(error.message);
  },
  presence: {
    role: 'editor' as const,
  },
});
expectType<RoomfulAdapter<{ role: 'editor' }>>(adapter);

expectType<'editor' | undefined>(get(adapter.presence).self.role);
expectType<'editor' | undefined>(get(adapter.presence).others[0]?.role);
expectType<boolean | undefined>(get(adapter.awareness).others[0]?.typing);
expectType<Readable<RoomStatus>>(adapter.status);
expectType<RoomStatus>(get(adapter.status));
expectType<Promise<void>>(adapter.connect());
expectType<Promise<void>>(adapter.disconnect());
expectType<Promise<void>>(adapter.destroy());

const [votesStore, setVotes] = adapter.state.shared('votes', {
  initialValue: {
    no: 0,
    yes: 0,
  },
});
expectType<Writable<{ no: number; yes: number }>>(votesStore);
expectType<
  (
    nextValue:
      | { no: number; yes: number }
      | ((current: { no: number; yes: number }) => { no: number; yes: number }),
  ) => void
>(setVotes);
setVotes((current) => {
  expectType<{ no: number; yes: number }>(current);
  return current;
});

const [persistedVotesStore, setPersistedVotes] = adapter.state.shared('persisted-votes', {
  initialValue: {
    no: 0,
    yes: 0,
  },
  persist: true,
});
expectType<Writable<{ no: number; yes: number }>>(persistedVotesStore);
setPersistedVotes((current) => {
  expectType<{ no: number; yes: number }>(current);
  return current;
});

const reactionChannel = adapter.events.channel<{ emoji: string }>('reaction');
expectType<string | undefined>(get(reactionChannel)?.payload.emoji);
expectType<'editor' | undefined>(get(reactionChannel)?.from.role);
adapter.events.on<{ emoji: string }>('reaction', (payload, from) => {
  expectType<string>(payload.emoji);
  expectType<'editor' | undefined>(from.role);
});
adapter.events.emit('reaction', {
  emoji: '🔥',
});
adapter.events.emitTo('peer-2', 'reaction', {
  emoji: '🔥',
});
expectType<Action<HTMLElement, undefined>>(adapter.cursors.mount);

expectType<ViewportState[]>(get(adapter.viewport));
expectType<number | undefined>(get(adapter.viewport)[0]?.scrollX);
expectType<Action<HTMLElement, undefined>>(adapter.viewport.mount);
adapter.viewport.follow('peer-id');
adapter.viewport.broadcast();
