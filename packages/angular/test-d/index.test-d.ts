import type { EnvironmentProviders, Signal } from '@angular/core';
import type {
  CommentThread,
  LockState,
  Peer,
  PointerBeam,
  PresenceData,
  Room,
  RoomStatus,
  TimelineEntry,
  Unsubscribe,
  ViewportState,
} from '@roomful/core';
import { expectType } from 'tsd';

import {
  injectAwareness,
  injectComments,
  injectConnectionStatus,
  injectCursors,
  injectEvent,
  injectHistory,
  injectLocks,
  injectLockState,
  injectPeers,
  injectPointer,
  injectPresence,
  injectRoom,
  injectSharedState,
  injectViewport,
  type InjectAwarenessResult,
  type InjectCommentsResult,
  type InjectHistoryResult,
  type InjectLocksResult,
  type InjectPointerResult,
  type InjectViewportResult,
  provideRoomful,
  type RoomfulProviderOptions,
  type SharedStateSetter,
} from '..';

const providers = provideRoomful('room-id', {
  onDisconnect(payload) {
    expectType<string | undefined>(payload.reason);
  },
  onError(error) {
    expectType<string>(error.message);
  },
  presence: {
    role: 'editor' as const,
  },
});
expectType<EnvironmentProviders>(providers);

const providerOptions = {
  presence: {
    role: 'editor' as const,
  },
} satisfies RoomfulProviderOptions<{ role: 'editor' }>;
expectType<{ role: 'editor' }>(providerOptions.presence);

const room = injectRoom<{ role: 'editor' | 'viewer' }>();
expectType<Room<{ role: 'editor' | 'viewer' }>>(room);

const presence = injectPresence<{ role: 'editor' | 'viewer' }>();
expectType<Signal<Peer<{ role: 'editor' | 'viewer' }>>>(presence.self);
expectType<'editor' | 'viewer' | undefined>(presence.self().role);

const cursors = injectCursors<{ tool: 'eraser' | 'pen' }>();
expectType<'eraser' | 'pen' | undefined>(cursors.cursors()[0]?.tool);

const emitMessage = injectEvent(
  'message',
  (payload: { text: string }, from: Peer<PresenceData>) => {
    expectType<string>(payload.text);
    expectType<Peer<PresenceData>>(from);
  },
);
expectType<(payload: { text: string }) => void>(emitMessage);

const awareness = injectAwareness();
expectType<InjectAwarenessResult>(awareness);
expectType<boolean | undefined>(awareness.others()[0]?.typing);

const viewport = injectViewport();
expectType<InjectViewportResult>(viewport);
expectType<Signal<ViewportState[]>>(viewport.states);
expectType<number | undefined>(viewport.states()[0]?.scrollX);
viewport.follow('peer-id');
viewport.broadcast();

const pointer = injectPointer();
expectType<InjectPointerResult>(pointer);
expectType<Signal<PointerBeam[]>>(pointer.beams);
expectType<number | undefined>(pointer.beams()[0]?.x);
expectType<boolean | undefined>(pointer.beams()[0]?.active);
pointer.activate();
pointer.deactivate();
expectType<Unsubscribe>(pointer.render({ style: 'laser' }));

const locks = injectLocks();
expectType<InjectLocksResult>(locks);
expectType<Signal<LockState[]>>(locks.locks);
expectType<Promise<boolean>>(locks.acquire('cell-1', { ttl: 1_000, timeout: 5_000 }));
expectType<Peer | null>(locks.getHolder('cell-1'));
locks.release('cell-1');
locks.releaseAll();

const lockState = injectLockState('cell-1');
expectType<Signal<LockState | null>>(lockState);
expectType<Peer | null | undefined>(lockState()?.holder);

const comments = injectComments();
expectType<InjectCommentsResult>(comments);
expectType<Signal<CommentThread[]>>(comments.threads);
expectType<boolean | undefined>(comments.threads()[0]?.resolved);
expectType<Promise<CommentThread>>(comments.add({ anchor: { elementId: 'cell-1' }, text: 'hi' }));
expectType<Promise<CommentThread>>(comments.reply('thread-1', 'reply'));
expectType<Promise<CommentThread>>(comments.resolve('thread-1'));
expectType<Promise<CommentThread>>(comments.reopen('thread-1'));
expectType<CommentThread[]>(comments.getByElement('cell-1'));
expectType<CommentThread[]>(comments.getOpen());

const commentsWithOptions = injectComments({ storage: 'indexeddb' });
expectType<InjectCommentsResult>(commentsWithOptions);

const history = injectHistory();
expectType<InjectHistoryResult>(history);
expectType<Signal<TimelineEntry[]>>(history.timeline);
expectType<string | undefined>(history.timeline()[0]?.action);
expectType<Signal<boolean>>(history.canUndo);
expectType<boolean>(history.canUndo());
expectType<Signal<boolean>>(history.canRedo);
history.capture('draw', 'Drew a circle');
history.transaction('add-shape', () => undefined);
expectType<Promise<void>>(history.undo());
expectType<Promise<void>>(history.redo());

const historyWithOptions = injectHistory({ maxEntries: 50, captureInterval: 0 });
expectType<InjectHistoryResult>(historyWithOptions);

const peers = injectPeers<{ role: 'editor' | 'viewer' }>();
expectType<Signal<Peer<{ role: 'editor' | 'viewer' }>[]>>(peers);

const connectionStatus = injectConnectionStatus();
expectType<Signal<RoomStatus>>(connectionStatus);

const [votes, setVotes] = injectSharedState('votes', {
  initialValue: {
    no: 0,
    yes: 0,
  },
});
expectType<Signal<{ no: number; yes: number }>>(votes);
expectType<{ no: number; yes: number }>(votes());
expectType<SharedStateSetter<{ no: number; yes: number }>>(setVotes);
expectType<{ no: number; yes: number }>(
  setVotes((current) => {
    expectType<{ no: number; yes: number }>(current);
    return current;
  }),
);
expectType<{ no: number; yes: number }>(setVotes({ no: 1, yes: 2 }));
