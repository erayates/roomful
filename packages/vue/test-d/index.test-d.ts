import type { Plugin, ShallowRef } from 'vue';

import { expectAssignable, expectType } from 'tsd';

import {
  RoomfulPlugin,
  type RoomfulPluginOptions,
  type ReadonlyRef,
  type SharedStateSetter,
  type UseAwarenessResult,
  useAwareness,
  useConnectionStatus,
  useCursors,
  useEvent,
  useLocks,
  type UseLocksResult,
  useLockState,
  usePointer,
  type UsePointerResult,
  usePresence,
  useSharedState,
  type UseViewportResult,
  useViewport,
} from '..';
import type {
  LockState,
  Peer,
  PointerBeam,
  PresenceData,
  RoomfulError,
  RoomStatus,
  Unsubscribe,
  ViewportState,
} from '@roomful/core';

const presence = usePresence<{ role: 'editor' | 'viewer' }>();
expectType<'editor' | 'viewer' | undefined>(presence.self.value.role);

const pluginOptions = {
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
  roomId: 'room-id',
} satisfies RoomfulPluginOptions<{ role: 'editor' }>;
expectType<string>(pluginOptions.roomId);
expectAssignable<Plugin>(RoomfulPlugin);

const connectionStatus = useConnectionStatus();
expectType<ReadonlyRef<RoomStatus>>(connectionStatus);
expectType<RoomStatus>(connectionStatus.value);

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

const viewport = useViewport();
expectType<UseViewportResult>(viewport);
expectType<HTMLElement | null>(viewport.ref.value);
expectType<ViewportState[]>(viewport.states.value);
expectType<number | undefined>(viewport.states.value[0]?.scrollX);
viewport.follow('peer-id');
viewport.broadcast();

const pointer = usePointer();
expectType<UsePointerResult>(pointer);
expectType<HTMLElement | null>(pointer.ref.value);
expectType<PointerBeam[]>(pointer.beams.value);
expectType<number | undefined>(pointer.beams.value[0]?.x);
expectType<boolean | undefined>(pointer.beams.value[0]?.active);
pointer.activate();
pointer.deactivate();
expectType<Unsubscribe>(pointer.render({ style: 'laser' }));

const locks = useLocks();
expectType<UseLocksResult>(locks);
expectType<ReadonlyRef<LockState[]>>(locks.locks);
expectType<LockState[]>(locks.locks.value);
expectType<Promise<boolean>>(locks.acquire('cell-1', { ttl: 1_000, timeout: 5_000 }));
expectType<Peer | null>(locks.getHolder('cell-1'));
locks.release('cell-1');
locks.releaseAll();

const lockState = useLockState('cell-1');
expectType<ReadonlyRef<LockState | null>>(lockState);
expectType<Peer | null | undefined>(lockState.value?.holder);

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
