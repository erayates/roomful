import type { EventEngine, EventOptions, Peer, PresenceData, Unsubscribe } from '../types';

type EventCallback<TPresence extends PresenceData, TPayload = unknown> = {
  bivarianceHack(payload: TPayload, from: Peer<TPresence>): void;
}['bivarianceHack'];

interface EventEngineContext<TPresence extends PresenceData> {
  emitEvent<TPayload>(
    name: string,
    payload: TPayload,
    toPeerId: string | undefined,
    loopback: boolean,
  ): void;
  onEvent<TPayload>(
    name: string,
    cb: EventCallback<TPresence, TPayload>,
  ): Unsubscribe;
  offEvent<TPayload>(name: string, cb: EventCallback<TPresence, TPayload>): void;
}

/**
 * Creates a typed custom event engine for a room.
 *
 * @typeParam TPresence - The room presence shape used for sender snapshots.
 * @param context - The room callbacks that deliver and subscribe to events.
 * @param options - Optional event behavior overrides.
 * @returns The event engine bound to the room.
 */
export function createEventEngine<TPresence extends PresenceData>(
  context: EventEngineContext<TPresence>,
  options?: EventOptions,
): EventEngine<TPresence> {
  const defaultLoopback = options?.loopback ?? false;

  return {
    emit<TPayload>(name: string, payload: TPayload) {
      context.emitEvent(name, payload, undefined, defaultLoopback);
    },
    emitTo<TPayload>(peerId: string, name: string, payload: TPayload) {
      context.emitEvent(name, payload, peerId, defaultLoopback);
    },
    on<TPayload>(name: string, cb: EventCallback<TPresence, TPayload>) {
      return context.onEvent(name, cb);
    },
    off<TPayload>(name: string, cb: EventCallback<TPresence, TPayload>) {
      context.offEvent(name, cb);
    },
  };
}
