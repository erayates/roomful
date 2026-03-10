import { expectType } from 'tsd';

import {
  createRoom,
  FlockError,
  type AwarenessEngine,
  type CursorPosition,
  type FlockErrorCode,
  type Peer,
  type Room,
  type RoomDiagnostics,
  type RoomStatus,
  type StateChangeMeta,
  type Unsubscribe,
} from '..';

const room = createRoom('room-id', {
  presence: {
    displayName: '' as string,
    role: 'editor' as const,
  },
});
expectType<Room<{ displayName: string; role: 'editor' }>>(room);

const presence = room.usePresence();
expectType<'editor' | undefined>(presence.getSelf().role);
expectType<string | undefined>(presence.getSelf().displayName);
expectType<Peer<{ displayName: string; role: 'editor' }>[]>(presence.getAll());

const cursors = room.useCursors<{ tool: 'eraser' | 'pen' }>();
expectType<CursorPosition<{ tool: 'eraser' | 'pen' }>[]>(cursors.getPositions());
expectType<'eraser' | 'pen' | undefined>(cursors.getPositions()[0]?.tool);

const state = room.useState({
  initialValue: {
    no: 0,
    yes: 0,
  },
});
expectType<{ no: number; yes: number }>(state.get());
const unsubscribeState = state.subscribe((value, meta) => {
  expectType<{ no: number; yes: number }>(value);
  expectType<StateChangeMeta>(meta);
});
expectType<Unsubscribe>(unsubscribeState);

const events = room.useEvents();
const handleMessage = (payload: { text: string }, from: Peer<{ displayName: string; role: 'editor' }>): void => {
  expectType<string>(payload.text);
  expectType<'editor' | undefined>(from.role);
};
const unsubscribeEvent = events.on('message', handleMessage);
expectType<Unsubscribe>(unsubscribeEvent);
events.off('message', handleMessage);

const emitMessage = (payload: { text: string }): void => {
  events.emit('message', payload);
};
expectType<(payload: { text: string }) => void>(emitMessage);

const emitDirectMessage = (peerId: string, payload: { text: string }): void => {
  events.emitTo(peerId, 'message', payload);
};
expectType<(peerId: string, payload: { text: string }) => void>(emitDirectMessage);

const awareness = room.useAwareness();
expectType<AwarenessEngine>(awareness);
const unsubscribeAwareness = awareness.subscribe((peers) => {
  expectType<string | null | undefined>(peers[0]?.focus);
  expectType<boolean | undefined>(peers[0]?.typing);
});
expectType<Unsubscribe>(unsubscribeAwareness);

const diagnostics = room.getDiagnostics();
expectType<Promise<RoomDiagnostics>>(diagnostics);

const status = room.status;
expectType<RoomStatus>(status);

const unsubscribeDisconnected = room.on('disconnected', (payload) => {
  expectType<string | undefined>(payload.reason);
});
expectType<Unsubscribe>(unsubscribeDisconnected);

const error = new FlockError('NETWORK_ERROR', 'network failed', true);
expectType<FlockError>(error);
expectType<FlockErrorCode>(error.code);
expectType<boolean>(error.recoverable);
