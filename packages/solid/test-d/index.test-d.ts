import type {
  LockState,
  Peer,
  PointerBeam,
  PresenceData,
  Room,
  RoomStatus,
  Unsubscribe,
  ViewportState,
} from '@roomful/core';
import type { Accessor, JSX } from 'solid-js';
import { expectType } from 'tsd';

import {
  RoomfulProvider,
  type RoomfulProviderProps,
  type SharedStateSetter,
  type UseAwarenessResult,
  useAwareness,
  useConnectionStatus,
  useCursors,
  useEvent,
  useLocks,
  type UseLocksResult,
  useLockState,
  usePeers,
  usePointer,
  type UsePointerResult,
  usePresence,
  useRoom,
  useSharedState,
  type UseViewportResult,
  useViewport,
} from '..';

const provider = RoomfulProvider({
  children: null,
  roomId: 'room-id',
});
expectType<JSX.Element>(provider);

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

const room = useRoom<{ role: 'editor' | 'viewer' }>();
expectType<Room<{ role: 'editor' | 'viewer' }>>(room);

const presence = usePresence<{ role: 'editor' | 'viewer' }>();
expectType<Accessor<Peer<{ role: 'editor' | 'viewer' }>>>(presence.self);
expectType<'editor' | 'viewer' | undefined>(presence.self().role);

const cursors = useCursors<{ tool: 'eraser' | 'pen' }>();
expectType<'eraser' | 'pen' | undefined>(cursors.cursors()[0]?.tool);

const emitMessage = useEvent('message', (payload: { text: string }, from: Peer<PresenceData>) => {
  expectType<string>(payload.text);
  expectType<Peer<PresenceData>>(from);
});
expectType<(payload: { text: string }) => void>(emitMessage);

const awareness = useAwareness();
expectType<UseAwarenessResult>(awareness);
expectType<boolean | undefined>(awareness.others()[0]?.typing);

const viewport = useViewport();
expectType<UseViewportResult>(viewport);
expectType<Accessor<ViewportState[]>>(viewport.states);
expectType<number | undefined>(viewport.states()[0]?.scrollX);
viewport.follow('peer-id');
viewport.broadcast();

const pointer = usePointer();
expectType<UsePointerResult>(pointer);
expectType<Accessor<PointerBeam[]>>(pointer.beams);
expectType<number | undefined>(pointer.beams()[0]?.x);
expectType<boolean | undefined>(pointer.beams()[0]?.active);
pointer.activate();
pointer.deactivate();
expectType<Unsubscribe>(pointer.render({ style: 'laser' }));

const locks = useLocks();
expectType<UseLocksResult>(locks);
expectType<Accessor<LockState[]>>(locks.locks);
expectType<Promise<boolean>>(locks.acquire('cell-1', { ttl: 1_000, timeout: 5_000 }));
expectType<Peer | null>(locks.getHolder('cell-1'));
locks.release('cell-1');
locks.releaseAll();

const lockState = useLockState('cell-1');
expectType<Accessor<LockState | null>>(lockState);
expectType<Peer | null | undefined>(lockState()?.holder);

const peers = usePeers<{ role: 'editor' | 'viewer' }>();
expectType<Accessor<Peer<{ role: 'editor' | 'viewer' }>[]>>(peers);

const connectionStatus = useConnectionStatus();
expectType<Accessor<RoomStatus>>(connectionStatus);

const [votes, setVotes] = useSharedState('votes', {
  initialValue: {
    no: 0,
    yes: 0,
  },
});
expectType<Accessor<{ no: number; yes: number }>>(votes);
expectType<{ no: number; yes: number }>(votes());
expectType<SharedStateSetter<{ no: number; yes: number }>>(setVotes);
expectType<{ no: number; yes: number }>(
  setVotes((current) => {
    expectType<{ no: number; yes: number }>(current);
    return current;
  }),
);
expectType<{ no: number; yes: number }>(setVotes({ no: 1, yes: 2 }));
