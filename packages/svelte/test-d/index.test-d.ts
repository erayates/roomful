import type {
  CommentThread,
  LockState,
  Peer,
  PointerBeam,
  RoomfulError,
  RoomStatus,
  Unsubscribe,
  ViewportState,
} from '@roomful/core';
import type { Action } from 'svelte/action';
import { get, type Readable, type Writable } from 'svelte/store';

import { expectType } from 'tsd';

import {
  type CommentsStore,
  type LocksStore,
  type LockStateStore,
  type PointerStore,
  roomful,
  type RoomfulAdapter,
} from '..';

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

expectType<PointerStore>(adapter.pointer);
expectType<PointerBeam[]>(get(adapter.pointer));
expectType<number | undefined>(get(adapter.pointer)[0]?.x);
expectType<boolean | undefined>(get(adapter.pointer)[0]?.active);
expectType<Action<HTMLElement, undefined>>(adapter.pointer.mount);
adapter.pointer.activate();
adapter.pointer.deactivate();
expectType<Unsubscribe>(adapter.pointer.render({ style: 'laser' }));

expectType<LocksStore>(adapter.locks);
expectType<LockState[]>(get(adapter.locks));
expectType<Peer | null | undefined>(get(adapter.locks)[0]?.holder);
expectType<Promise<boolean>>(adapter.locks.acquire('cell-1', { ttl: 1_000, timeout: 5_000 }));
expectType<Peer | null>(adapter.locks.getHolder('cell-1'));
adapter.locks.release('cell-1');
adapter.locks.releaseAll();

const lockStateStore = adapter.lockState('cell-1');
expectType<LockStateStore>(lockStateStore);
expectType<LockState | null>(get(lockStateStore));
expectType<Peer | null | undefined>(get(lockStateStore)?.holder);

expectType<CommentsStore>(adapter.comments);
expectType<CommentThread[]>(get(adapter.comments));
expectType<boolean | undefined>(get(adapter.comments)[0]?.resolved);
expectType<Promise<CommentThread>>(
  adapter.comments.add({ anchor: { elementId: 'cell-1' }, text: 'hi' }),
);
expectType<Promise<CommentThread>>(adapter.comments.reply('thread-1', 'reply'));
expectType<Promise<CommentThread>>(adapter.comments.resolve('thread-1'));
expectType<Promise<CommentThread>>(adapter.comments.reopen('thread-1'));
expectType<CommentThread[]>(adapter.comments.getByElement('cell-1'));
expectType<CommentThread[]>(adapter.comments.getOpen());

const commentsConfiguredAdapter = roomful('comments-room', {
  comments: { storage: 'indexeddb' },
});
expectType<CommentsStore>(commentsConfiguredAdapter.comments);
