import { expectType } from 'tsd';

import { createRoom, type Peer, type RoomStatus } from '..';

const room = createRoom('room-id', {
  presence: {
    displayName: '' as string,
    role: 'editor' as const,
  },
});

const presence = room.usePresence();
expectType<'editor' | undefined>(presence.getSelf().role);
expectType<string | undefined>(presence.getSelf().displayName);
expectType<Peer<{ displayName: string; role: 'editor' }>[]>(presence.getAll());

const state = room.useState({
  initialValue: {
    no: 0,
    yes: 0,
  },
});
expectType<{ no: number; yes: number }>(state.get());

const events = room.useEvents();
events.on('message', (payload: { text: string }, from) => {
  expectType<string>(payload.text);
  expectType<'editor' | undefined>(from.role);
});

const emitMessage = (payload: { text: string }): void => {
  events.emit('message', payload);
};
expectType<(payload: { text: string }) => void>(emitMessage);

const status = room.status;
expectType<RoomStatus>(status);
