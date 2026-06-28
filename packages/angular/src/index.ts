import type { EnvironmentProviders, Signal } from '@angular/core';
import {
  assertInInjectionContext,
  DestroyRef,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  signal,
} from '@angular/core';
import type {
  AwarenessEngine,
  AwarenessState,
  CursorData,
  CursorEngine,
  CursorOptions,
  CursorPosition,
  Peer,
  PresenceData,
  PresenceEngine,
  Room,
  RoomOptions,
  RoomStatus,
  StateEngine,
  StateOptions,
} from '@roomful/core';
import { createRoom, RoomfulError } from '@roomful/core';
import {
  areAwarenessArraysEqual,
  areCursorArraysEqual,
  areCursorPositionsEqual,
  arePeerArraysEqual,
  arePeersEqual,
  areStructuredValuesEqual,
  assertCompatibleSharedStateBinding,
  createSharedStateBinding,
  isObjectLike,
  readSelfPeer,
  type SharedStateBinding,
} from '@roomful/core/adapter-runtime';

/**
 * Mirrors React-style updater semantics for the Angular shared-state setter.
 *
 * @typeParam T - The shared state value type.
 */
export type SetStateAction<T> = T | ((previous: T) => T);

/**
 * Updates a shared state binding and returns the resolved value.
 *
 * @typeParam T - The shared state value type.
 * @param nextValue - The next value or an updater derived from the previous value.
 * @returns The resolved shared state value.
 */
export type SharedStateSetter<T> = (nextValue: SetStateAction<T>) => T;

/**
 * Configures {@link provideRoomful}.
 *
 * @typeParam TPresence - The room presence shape inferred from `presence`.
 */
export interface RoomfulProviderOptions<
  TPresence extends PresenceData = PresenceData,
> extends RoomOptions<TPresence> {
  /**
   * Runs after the room connects.
   */
  onConnect?: () => void;

  /**
   * Runs after the room disconnects.
   */
  onDisconnect?: (payload: { reason?: string }) => void;

  /**
   * Runs when the room emits an operational error.
   */
  onError?: (error: RoomfulError) => void;
}

/**
 * Describes the return value of {@link injectPresence}.
 *
 * @typeParam TPresence - The room presence shape.
 */
export interface InjectPresenceResult<TPresence extends PresenceData = PresenceData> {
  /**
   * Exposes the local peer snapshot.
   */
  self: Signal<Peer<TPresence>>;

  /**
   * Exposes remote peers only.
   */
  others: Signal<Peer<TPresence>[]>;

  /**
   * Exposes local and remote peers.
   */
  all: Signal<Peer<TPresence>[]>;

  /**
   * Partially updates the local presence payload.
   */
  update: PresenceEngine<TPresence>['update'];

  /**
   * Replaces the local presence payload.
   */
  replace: PresenceEngine<TPresence>['replace'];
}

/**
 * Describes the return value of {@link injectCursors}.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 */
export interface InjectCursorsResult<TCursor extends CursorData = CursorData> {
  /**
   * Exposes the latest cursor positions.
   */
  cursors: Signal<CursorPosition<TCursor>[]>;

  /**
   * Mounts cursor tracking on an element.
   *
   * @param element - The element to observe.
   * @returns Nothing.
   */
  mount(element: HTMLElement): void;

  /**
   * Unmounts cursor tracking.
   *
   * @returns Nothing.
   */
  unmount(): void;
}

/**
 * Describes the return value of {@link injectAwareness}.
 */
export interface InjectAwarenessResult {
  /**
   * Exposes remote awareness state only.
   */
  others: Signal<AwarenessState[]>;

  /**
   * Merges arbitrary awareness metadata into the local peer.
   */
  set: AwarenessEngine['set'];

  /**
   * Updates the local focus target.
   */
  setFocus: AwarenessEngine['setFocus'];

  /**
   * Updates the local selection.
   */
  setSelection: AwarenessEngine['setSelection'];

  /**
   * Updates the local typing state.
   */
  setTyping: AwarenessEngine['setTyping'];
}

interface PresenceSnapshot<TPresence extends PresenceData> {
  self: Peer<TPresence>;
  others: Peer<TPresence>[];
  all: Peer<TPresence>[];
}

interface PresenceSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PresenceEngine<TPresence>;
  snapshot: PresenceSnapshot<TPresence>;
}

interface CursorSnapshotCache<TPresence extends PresenceData, TCursor extends CursorData> {
  room: Room<TPresence>;
  engine: CursorEngine<TCursor>;
  snapshot: CursorPosition<TCursor>[];
}

interface AwarenessSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: AwarenessEngine;
  snapshot: AwarenessState[];
}

interface PeerSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PresenceEngine<TPresence>;
  snapshot: Peer<TPresence>[];
}

interface SharedStateSnapshotCache<TPresence extends PresenceData, T> {
  room: Room<TPresence>;
  engine: StateEngine<T>;
  snapshot: T;
}

type EventHandlerRef<TPayload, TPresence extends PresenceData> = {
  bivarianceHack(payload: TPayload, from: Peer<TPresence>): void;
}['bivarianceHack'];

const sharedStateBindings = new WeakMap<Room<PresenceData>, SharedStateBinding>();

/**
 * Carries the active room through Angular dependency injection.
 *
 * Provided by {@link provideRoomful}; consumed by the `inject*` helpers. The
 * token has no default factory: the `inject*` helpers read it optionally and
 * raise a descriptive {@link RoomfulError} when it is absent, rather than
 * throwing inside Angular's injector (which would surface as a generic DI
 * error).
 */
export const ROOMFUL_ROOM = new InjectionToken<Room<PresenceData>>('ROOMFUL_ROOM');

/**
 * Creates a room and provides it to the Angular injector.
 *
 * The returned providers create the room, connect it, forward `connected`,
 * `disconnected`, and `error` events to the optional callbacks, and disconnect
 * the room when the surrounding injection context is destroyed.
 *
 * @typeParam TPresence - The room presence shape inferred from `options.presence`.
 * @param roomId - Identifies the room to create or join.
 * @param options - The room configuration and lifecycle callbacks.
 * @returns Environment providers exposing the room through {@link ROOMFUL_ROOM}.
 */
export function provideRoomful<TPresence extends PresenceData = PresenceData>(
  roomId: string,
  options: RoomfulProviderOptions<TPresence> = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ROOMFUL_ROOM,
      useFactory(): Room<TPresence> {
        const room = createRoom(roomId, createRoomOptions(options));

        const unsubscribeConnected = room.on('connected', () => {
          options.onConnect?.();
        });
        const unsubscribeDisconnected = room.on('disconnected', (payload) => {
          options.onDisconnect?.(payload);
        });
        const unsubscribeError = room.on('error', (error) => {
          options.onError?.(error);
        });

        void room.connect().catch(() => {
          return undefined;
        });

        inject(DestroyRef).onDestroy(() => {
          unsubscribeError();
          unsubscribeDisconnected();
          unsubscribeConnected();

          void room.disconnect().catch(() => {
            return undefined;
          });
        });

        return room;
      },
    },
  ]);
}

/**
 * Returns the current room provided by {@link provideRoomful}.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape to project onto the room.
 * @returns The current room instance.
 * @throws {RoomfulError} When called outside a `provideRoomful` context.
 */
export function injectRoom<TPresence extends PresenceData = PresenceData>(): Room<TPresence> {
  assertInInjectionContext(injectRoom);
  const room = inject(ROOMFUL_ROOM, { optional: true });

  if (!isRoom<TPresence>(room)) {
    throw new RoomfulError(
      'INVALID_STATE',
      'injectRoom() must be used within a provideRoomful() context.',
      false,
    );
  }

  return room;
}

/**
 * Subscribes to room presence snapshots.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The local peer, remote peers, and presence mutators as signals.
 */
export function injectPresence<
  TPresence extends PresenceData = PresenceData,
>(): InjectPresenceResult<TPresence> {
  assertInInjectionContext(injectPresence);
  const room = injectRoom<TPresence>();
  const presence = room.usePresence();
  const cacheRef: { current: PresenceSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const initialSnapshot = readPresenceSnapshot(room, presence, cacheRef);
  const self = signal(initialSnapshot.self);
  const others = signal(initialSnapshot.others);
  const all = signal(initialSnapshot.all);

  const unsubscribe = presence.subscribe(() => {
    const nextSnapshot = readPresenceSnapshot(room, presence, cacheRef);
    self.set(nextSnapshot.self);
    others.set(nextSnapshot.others);
    all.set(nextSnapshot.all);
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return {
    self,
    others,
    all,
    update: presence.update,
    replace: presence.replace,
  };
}

/**
 * Subscribes to cursor snapshots and returns mounting helpers.
 *
 * Must be called in an injection context. Angular has no React-style callback
 * ref, so mount the engine on an element from `afterNextRender` or
 * `ngAfterViewInit` by calling {@link InjectCursorsResult.mount}.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional cursor tracking configuration.
 * @returns The cursor snapshot signal and mounting helpers.
 */
export function injectCursors<
  TCursor extends CursorData = CursorData,
  TPresence extends PresenceData = PresenceData,
>(options?: CursorOptions): InjectCursorsResult<TCursor> {
  assertInInjectionContext(injectCursors);
  const room = injectRoom<TPresence>();
  const cursorEngine = room.useCursors<TCursor>(options);
  const cacheRef: { current: CursorSnapshotCache<TPresence, TCursor> | null } = {
    current: null,
  };
  const cursors = signal(readCursorSnapshot(room, cursorEngine, cacheRef));

  let trackedElement: HTMLElement | null = null;
  let mounted = false;

  const mount = (element: HTMLElement): void => {
    if (trackedElement === element) {
      return;
    }

    if (trackedElement !== null) {
      cursorEngine.unmount();
    }

    trackedElement = element;
    cursorEngine.mount(element);
    mounted = true;
  };

  const unmount = (): void => {
    if (trackedElement === null) {
      return;
    }

    cursorEngine.unmount();
    trackedElement = null;
    mounted = false;
  };

  const unsubscribe = cursorEngine.subscribe(() => {
    cursors.set(readCursorSnapshot(room, cursorEngine, cacheRef));
  });

  inject(DestroyRef).onDestroy(() => {
    unsubscribe();

    if (mounted) {
      cursorEngine.unmount();
      trackedElement = null;
      mounted = false;
    }
  });

  return {
    cursors,
    mount,
    unmount,
  };
}

/**
 * Subscribes to awareness snapshots.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns Remote awareness state signal and local awareness mutators.
 */
export function injectAwareness<
  TPresence extends PresenceData = PresenceData,
>(): InjectAwarenessResult {
  assertInInjectionContext(injectAwareness);
  const room = injectRoom<TPresence>();
  const awareness = room.useAwareness();
  const cacheRef: { current: AwarenessSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const others = signal(readAwarenessSnapshot(room, awareness, cacheRef));

  const unsubscribe = awareness.subscribe(() => {
    others.set(readAwarenessSnapshot(room, awareness, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return {
    others,
    set: (value) => {
      awareness.set(value);
    },
    setFocus: (elementId) => {
      awareness.setFocus(elementId);
    },
    setSelection: (selection) => {
      awareness.setSelection(selection);
    },
    setTyping: (isTyping) => {
      awareness.setTyping(isTyping);
    },
  };
}

/**
 * Subscribes to a custom event channel and returns an emitter for that channel.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPayload - The payload type for the channel.
 * @typeParam TPresence - The room presence shape.
 * @param name - The custom event channel name.
 * @param handler - The callback invoked for incoming events.
 * @returns A function that emits payloads on the same channel.
 */
export function injectEvent<TPayload = unknown, TPresence extends PresenceData = PresenceData>(
  name: string,
  handler: EventHandlerRef<TPayload, TPresence>,
): (payload: TPayload) => void {
  assertInInjectionContext(injectEvent);
  const room = injectRoom<TPresence>();
  const boundHandler: EventHandlerRef<unknown, TPresence> = handler;

  const unsubscribe = room.useEvents().on(name, (payload, from) => {
    boundHandler(payload, from);
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return (payload: TPayload): void => {
    room.useEvents().emit(name, payload);
  };
}

/**
 * Subscribes to the full remote peer list for the current room.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The latest remote peer list signal.
 */
export function injectPeers<TPresence extends PresenceData = PresenceData>(): Signal<
  Peer<TPresence>[]
> {
  assertInInjectionContext(injectPeers);
  const room = injectRoom<TPresence>();
  const presence = room.usePresence();
  const cacheRef: { current: PeerSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const peers = signal(readPeersSnapshot(room, presence, cacheRef));

  const unsubscribe = presence.subscribe(() => {
    peers.set(readPeersSnapshot(room, presence, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return peers;
}

/**
 * Subscribes to the current room connection status.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The latest connection status signal.
 */
export function injectConnectionStatus<
  TPresence extends PresenceData = PresenceData,
>(): Signal<RoomStatus> {
  assertInInjectionContext(injectConnectionStatus);
  const room = injectRoom<TPresence>();
  const status = signal<RoomStatus>(room.status);

  const sync = (): void => {
    status.set(room.status);
  };

  const unsubscribeConnected = room.on('connected', sync);
  const unsubscribeReconnecting = room.on('reconnecting', sync);
  const unsubscribeDisconnected = room.on('disconnected', sync);
  const unsubscribeError = room.on('error', sync);

  sync();

  inject(DestroyRef).onDestroy(() => {
    unsubscribeError();
    unsubscribeDisconnected();
    unsubscribeReconnecting();
    unsubscribeConnected();
  });

  return status;
}

/**
 * Binds a shared state value to Angular signal semantics.
 *
 * Must be called in an injection context. Enforces a single shared-state
 * binding per room: a second `injectSharedState` for the same room must use the
 * same key and compatible options.
 *
 * @typeParam T - The shared state value type.
 * @typeParam TPresence - The room presence shape.
 * @param key - The logical binding key used to enforce a single shared-state binding per room.
 * @param options - The shared-state configuration.
 * @returns The current shared state signal and a React-style setter.
 */
export function injectSharedState<T, TPresence extends PresenceData = PresenceData>(
  key: string,
  options: StateOptions<T>,
): readonly [Signal<T>, SharedStateSetter<T>] {
  assertInInjectionContext(injectSharedState);
  const room = injectRoom<TPresence>();
  const existingBinding = sharedStateBindings.get(room) ?? null;

  if (existingBinding !== null) {
    assertCompatibleSharedStateBinding(existingBinding, key, options, {
      method: 'injectSharedState',
      container: 'room',
    });
  }

  const state = room.useState(options);
  const binding = existingBinding ?? createSharedStateBinding(key, options);
  sharedStateBindings.set(room, binding);

  if (binding.persist !== true && options.persist === true && binding.strategy === 'lww') {
    binding.persist = true;
  }

  const cacheRef: { current: SharedStateSnapshotCache<TPresence, T> | null } = {
    current: null,
  };
  const value = signal(readSharedStateSnapshot(room, state, cacheRef));

  const unsubscribe = state.subscribe(() => {
    value.set(readSharedStateSnapshot(room, state, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  const setSharedValue: SharedStateSetter<T> = (nextValue) => {
    const previousValue = state.get();
    const resolvedValue = isStateUpdater(nextValue) ? nextValue(previousValue) : nextValue;

    if (areStructuredValuesEqual(previousValue, resolvedValue)) {
      return previousValue;
    }

    state.set(resolvedValue);
    value.set(resolvedValue);
    return resolvedValue;
  };

  return [value, setSharedValue] as const;
}

function createRoomOptions<TPresence extends PresenceData = PresenceData>(
  source: RoomfulProviderOptions<TPresence>,
): RoomOptions<TPresence> {
  const options: RoomOptions<TPresence> = {};

  if (source.transport !== undefined) {
    options.transport = source.transport;
  }

  if (source.presence !== undefined) {
    options.presence = source.presence;
  }

  if (source.maxPeers !== undefined) {
    options.maxPeers = source.maxPeers;
  }

  if (source.stunUrls !== undefined) {
    options.stunUrls = source.stunUrls;
  }

  if (source.relayUrl !== undefined) {
    options.relayUrl = source.relayUrl;
  }

  if (source.relayAuth !== undefined) {
    options.relayAuth = source.relayAuth;
  }

  if (source.reconnect !== undefined) {
    options.reconnect = source.reconnect;
  }

  if (source.webrtc !== undefined) {
    options.webrtc = source.webrtc;
  }

  if (source.websocket !== undefined) {
    options.websocket = source.websocket;
  }

  if (source.encryption !== undefined) {
    options.encryption = source.encryption;
  }

  if (source.debug !== undefined) {
    options.debug = source.debug;
  }

  return options;
}

function readPresenceSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  cacheRef: { current: PresenceSnapshotCache<TPresence> | null },
): PresenceSnapshot<TPresence> {
  const all = presence.getAll();
  const self = readSelfPeer(room, presence, all);
  const others = all.filter((peer) => {
    return peer.id !== room.peerId;
  });
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === presence) {
    const previousSnapshot = previous.snapshot;
    const isAllEqual = arePeerArraysEqual(previousSnapshot.all, all);
    const isSelfEqual = arePeersEqual(previousSnapshot.self, self);
    const isOthersEqual = arePeerArraysEqual(previousSnapshot.others, others);

    if (isAllEqual && isSelfEqual && isOthersEqual) {
      return previousSnapshot;
    }

    const nextSnapshot: PresenceSnapshot<TPresence> = {
      self: isSelfEqual ? previousSnapshot.self : self,
      others: isOthersEqual ? previousSnapshot.others : others,
      all: isAllEqual ? previousSnapshot.all : all,
    };

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  const snapshot: PresenceSnapshot<TPresence> = {
    self,
    others,
    all,
  };

  cacheRef.current = {
    room,
    engine: presence,
    snapshot,
  };

  return snapshot;
}

function readPeersSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  cacheRef: { current: PeerSnapshotCache<TPresence> | null },
): Peer<TPresence>[] {
  const nextSnapshot = room.peers;
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === presence) {
    const previousSnapshot = previous.snapshot;
    if (arePeerArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((peer, index) => {
      const previousPeer = previousSnapshot[index];
      if (previousPeer !== undefined && arePeersEqual(previousPeer, peer)) {
        return previousPeer;
      }

      return peer;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: presence,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function readCursorSnapshot<TPresence extends PresenceData, TCursor extends CursorData>(
  room: Room<TPresence>,
  cursors: CursorEngine<TCursor>,
  cacheRef: { current: CursorSnapshotCache<TPresence, TCursor> | null },
): CursorPosition<TCursor>[] {
  const nextSnapshot = cursors.getPositions();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === cursors) {
    const previousSnapshot = previous.snapshot;
    if (areCursorArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((position, index) => {
      const previousPosition = previousSnapshot[index];
      if (previousPosition !== undefined && areCursorPositionsEqual(previousPosition, position)) {
        return previousPosition;
      }

      return position;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: cursors,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function readAwarenessSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  awareness: AwarenessEngine,
  cacheRef: { current: AwarenessSnapshotCache<TPresence> | null },
): AwarenessState[] {
  const nextOthers = awareness.getAll().filter((entry) => {
    return entry.peerId !== room.peerId;
  });
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === awareness) {
    const previousSnapshot = previous.snapshot;
    if (areAwarenessArraysEqual(previousSnapshot, nextOthers)) {
      return previousSnapshot;
    }

    previous.snapshot = nextOthers.map((entry, index) => {
      const previousEntry = previousSnapshot[index];
      if (previousEntry !== undefined && areStructuredValuesEqual(previousEntry, entry)) {
        return previousEntry;
      }

      return entry;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: awareness,
    snapshot: nextOthers,
  };
  return nextOthers;
}

function readSharedStateSnapshot<TPresence extends PresenceData, T>(
  room: Room<TPresence>,
  state: StateEngine<T>,
  cacheRef: { current: SharedStateSnapshotCache<TPresence, T> | null },
): T {
  const nextSnapshot = state.get();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === state) {
    if (areStructuredValuesEqual(previous.snapshot, nextSnapshot)) {
      return previous.snapshot;
    }

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  cacheRef.current = {
    room,
    engine: state,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function isStateUpdater<T>(value: SetStateAction<T>): value is (previous: T) => T {
  return typeof value === 'function';
}

function isRoom<TPresence extends PresenceData = PresenceData>(
  value: unknown,
): value is Room<TPresence> {
  if (!isObjectLike(value)) {
    return false;
  }

  return (
    typeof Reflect.get(value, 'id') === 'string' &&
    typeof Reflect.get(value, 'peerId') === 'string' &&
    hasFunction(value, 'connect') &&
    hasFunction(value, 'disconnect') &&
    hasFunction(value, 'usePresence') &&
    hasFunction(value, 'useCursors') &&
    hasFunction(value, 'useState') &&
    hasFunction(value, 'useAwareness') &&
    hasFunction(value, 'useEvents') &&
    hasFunction(value, 'getYDoc') &&
    hasFunction(value, 'getYProvider') &&
    hasFunction(value, 'on') &&
    hasFunction(value, 'off')
  );
}

function hasFunction(value: object, key: string): boolean {
  return typeof Reflect.get(value, key) === 'function';
}
