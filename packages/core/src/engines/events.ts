import type { EventEngine, EventOptions, Peer, PresenceData, Unsubscribe } from '../types';

interface EventEngineContext<TPresence extends PresenceData> {
  emitEvent<TPayload>(
    name: string,
    payload: TPayload,
    toPeerId: string | undefined,
    loopback: boolean,
  ): void;
  onEvent<TPayload>(
    name: string,
    cb: (payload: TPayload, from: Peer<TPresence>) => void,
  ): Unsubscribe;
  offEvent<TPayload>(name: string, cb: (payload: TPayload, from: Peer<TPresence>) => void): void;
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
    on<TPayload>(name: string, cb: (payload: TPayload, from: Peer<TPresence>) => void) {
      return context.onEvent(
        name,
        cb as unknown as (payload: unknown, from: Peer<TPresence>) => void,
      );
    },
    off<TPayload>(name: string, cb: (payload: TPayload, from: Peer<TPresence>) => void) {
      context.offEvent(name, cb as unknown as (payload: unknown, from: Peer<TPresence>) => void);
    },
  };
}
