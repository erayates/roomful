import type { EnvironmentProviders, Signal } from '@angular/core';
import type { LockState, Peer, PresenceData, Room, RoomStatus, ViewportState } from '@roomful/core';
import { expectType } from 'tsd';

import {
  injectAwareness,
  injectConnectionStatus,
  injectCursors,
  injectEvent,
  injectLocks,
  injectLockState,
  injectPeers,
  injectPresence,
  injectRoom,
  injectSharedState,
  injectViewport,
  type InjectAwarenessResult,
  type InjectLocksResult,
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
