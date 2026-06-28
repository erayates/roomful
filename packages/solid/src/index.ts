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
import type { Accessor, JSX } from 'solid-js';
import {
  createComponent,
  createContext,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from 'solid-js';

/**
 * Mirrors React-style updater semantics for the Solid shared-state setter.
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
 * Configures the Solid provider.
 *
 * @typeParam TPresence - The room presence shape inferred from `presence`.
 */
export interface RoomfulProviderProps<
  TPresence extends PresenceData = PresenceData,
> extends RoomOptions<TPresence> {
  /**
   * Identifies the room to create or join.
   */
  roomId: string;

  /**
   * Renders the provider subtree.
   */
  children?: JSX.Element;

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
 * Describes the return value of `usePresence`.
 *
 * @typeParam TPresence - The room presence shape.
 */
export interface UsePresenceResult<TPresence extends PresenceData = PresenceData> {
  /**
   * Exposes the local peer snapshot.
   */
  self: Accessor<Peer<TPresence>>;

  /**
   * Exposes remote peers only.
   */
  others: Accessor<Peer<TPresence>[]>;

  /**
   * Exposes local and remote peers.
   */
  all: Accessor<Peer<TPresence>[]>;

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
 * Describes the return value of `useCursors`.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 */
export interface UseCursorsResult<TCursor extends CursorData = CursorData> {
  /**
   * Callback ref that mounts the cursor engine on an element.
   *
   * @param element - The element to observe, or `null` to unmount.
   * @returns Nothing.
   */
  ref(element: HTMLElement | null): void;

  /**
   * Exposes the latest cursor positions.
   */
  cursors: Accessor<CursorPosition<TCursor>[]>;

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
 * Describes the return value of `useAwareness`.
 */
export interface UseAwarenessResult {
  /**
   * Exposes remote awareness state only.
   */
  others: Accessor<AwarenessState[]>;

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

const RoomfulRoomContext = createContext<unknown>(null);

/**
 * Creates a room and provides it to the Solid subtree.
 *
 * @typeParam TPresence - The room presence shape inferred from `props.presence`.
 * @param props - The provider configuration and children.
 * @returns The provider element.
 */
export function RoomfulProvider<TPresence extends PresenceData = PresenceData>(
  props: RoomfulProviderProps<TPresence>,
): JSX.Element {
  const room = createRoom(props.roomId, createRoomOptions(props));

  const unsubscribeConnected = room.on('connected', () => {
    props.onConnect?.();
  });
  const unsubscribeDisconnected = room.on('disconnected', (payload) => {
    props.onDisconnect?.(payload);
  });
  const unsubscribeError = room.on('error', (error) => {
    props.onError?.(error);
  });

  void room.connect().catch(() => {
    return undefined;
  });

  onCleanup(() => {
    unsubscribeError();
    unsubscribeDisconnected();
    unsubscribeConnected();

    void room.disconnect().catch(() => {
      return undefined;
    });
  });

  return createComponent(RoomfulRoomContext.Provider, {
    value: room,
    get children() {
      return props.children;
    },
  });
}

/**
 * Returns the current room from `RoomfulProvider`.
 *
 * @typeParam TPresence - The room presence shape to project onto the room.
 * @returns The current room instance.
 * @throws {RoomfulError} When called outside `RoomfulProvider`.
 */
export function useRoom<TPresence extends PresenceData = PresenceData>(): Room<TPresence> {
  const room = useContext(RoomfulRoomContext);

  if (!isRoom<TPresence>(room)) {
    throw new RoomfulError(
      'INVALID_STATE',
      'useRoom() must be used within a RoomfulProvider.',
      false,
    );
  }

  return room;
}

/**
 * Subscribes to room presence snapshots.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The local peer, remote peers, and presence mutators.
 */
export function usePresence<
  TPresence extends PresenceData = PresenceData,
>(): UsePresenceResult<TPresence> {
  const room = useRoom<TPresence>();
  const presence = room.usePresence();
  const cacheRef: { current: PresenceSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const initialSnapshot = readPresenceSnapshot(room, presence, cacheRef);
  const [self, setSelf] = createSignal(initialSnapshot.self);
  const [others, setOthers] = createSignal(initialSnapshot.others);
  const [all, setAll] = createSignal(initialSnapshot.all);

  onMount(() => {
    const sync = (): void => {
      const nextSnapshot = readPresenceSnapshot(room, presence, cacheRef);
      setSelf(() => nextSnapshot.self);
      setOthers(() => nextSnapshot.others);
      setAll(() => nextSnapshot.all);
    };

    sync();

    const unsubscribe = presence.subscribe(() => {
      sync();
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

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
 * @typeParam TCursor - The custom cursor payload shape.
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional cursor tracking configuration.
 * @returns The cursor snapshot and mounting helpers.
 */
export function useCursors<
  TCursor extends CursorData = CursorData,
  TPresence extends PresenceData = PresenceData,
>(options?: CursorOptions): UseCursorsResult<TCursor> {
  const room = useRoom<TPresence>();
  const cursorEngine = room.useCursors<TCursor>(options);
  const cacheRef: { current: CursorSnapshotCache<TPresence, TCursor> | null } = {
    current: null,
  };
  const [cursors, setCursors] = createSignal(readCursorSnapshot(room, cursorEngine, cacheRef));

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

  const ref = (element: HTMLElement | null): void => {
    if (element === null) {
      unmount();
      return;
    }

    mount(element);
  };

  onMount(() => {
    const sync = (): void => {
      const nextSnapshot = readCursorSnapshot(room, cursorEngine, cacheRef);
      setCursors(() => nextSnapshot);
    };

    sync();

    const unsubscribe = cursorEngine.subscribe(() => {
      sync();
    });

    onCleanup(() => {
      unsubscribe();

      if (mounted) {
        cursorEngine.unmount();
        trackedElement = null;
        mounted = false;
      }
    });
  });

  return {
    ref,
    cursors,
    mount,
    unmount,
  };
}

/**
 * Subscribes to awareness snapshots.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns Remote awareness state and local awareness mutators.
 */
export function useAwareness<TPresence extends PresenceData = PresenceData>(): UseAwarenessResult {
  const room = useRoom<TPresence>();
  const awareness = room.useAwareness();
  const cacheRef: { current: AwarenessSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const [others, setOthers] = createSignal(readAwarenessSnapshot(room, awareness, cacheRef));

  onMount(() => {
    const sync = (): void => {
      const nextSnapshot = readAwarenessSnapshot(room, awareness, cacheRef);
      setOthers(() => nextSnapshot);
    };

    sync();

    const unsubscribe = awareness.subscribe(() => {
      sync();
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

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
 * @typeParam TPayload - The payload type for the channel.
 * @typeParam TPresence - The room presence shape.
 * @param name - The custom event channel name.
 * @param handler - The callback invoked for incoming events.
 * @returns A function that emits payloads on the same channel.
 */
export function useEvent<TPayload = unknown, TPresence extends PresenceData = PresenceData>(
  name: string,
  handler: EventHandlerRef<TPayload, TPresence>,
): (payload: TPayload) => void {
  const room = useRoom<TPresence>();
  const boundHandler: EventHandlerRef<unknown, TPresence> = handler;

  onMount(() => {
    const unsubscribe = room.useEvents().on(name, (payload, from) => {
      boundHandler(payload, from);
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  return (payload: TPayload): void => {
    room.useEvents().emit(name, payload);
  };
}

/**
 * Subscribes to the full peer list for the current room.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The latest peer list accessor.
 */
export function usePeers<TPresence extends PresenceData = PresenceData>(): Accessor<
  Peer<TPresence>[]
> {
  const room = useRoom<TPresence>();
  const presence = room.usePresence();
  const cacheRef: { current: PeerSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const [peers, setPeers] = createSignal(readPeersSnapshot(room, presence, cacheRef));

  onMount(() => {
    const sync = (): void => {
      const nextSnapshot = readPeersSnapshot(room, presence, cacheRef);
      setPeers(() => nextSnapshot);
    };

    sync();

    const unsubscribe = presence.subscribe(() => {
      sync();
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  return peers;
}

/**
 * Subscribes to the current room connection status.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The latest connection status accessor.
 */
export function useConnectionStatus<
  TPresence extends PresenceData = PresenceData,
>(): Accessor<RoomStatus> {
  const room = useRoom<TPresence>();
  const [status, setStatus] = createSignal<RoomStatus>(room.status);

  onMount(() => {
    const sync = (): void => {
      setStatus(() => room.status);
    };

    const unsubscribeConnected = room.on('connected', sync);
    const unsubscribeReconnecting = room.on('reconnecting', sync);
    const unsubscribeDisconnected = room.on('disconnected', sync);
    const unsubscribeError = room.on('error', sync);

    sync();

    onCleanup(() => {
      unsubscribeError();
      unsubscribeDisconnected();
      unsubscribeReconnecting();
      unsubscribeConnected();
    });
  });

  return status;
}

/**
 * Binds a shared state value to Solid signal semantics.
 *
 * @typeParam T - The shared state value type.
 * @typeParam TPresence - The room presence shape.
 * @param key - The logical binding key used to enforce a single shared-state binding per room.
 * @param options - The shared-state configuration.
 * @returns The current shared state accessor and a React-style setter.
 */
export function useSharedState<T, TPresence extends PresenceData = PresenceData>(
  key: string,
  options: StateOptions<T>,
): readonly [Accessor<T>, SharedStateSetter<T>] {
  const room = useRoom<TPresence>();
  const existingBinding = sharedStateBindings.get(room) ?? null;

  if (existingBinding !== null) {
    assertCompatibleSharedStateBinding(existingBinding, key, options);
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
  const [value, setValue] = createSignal(readSharedStateSnapshot(room, state, cacheRef));

  onMount(() => {
    const sync = (): void => {
      const nextSnapshot = readSharedStateSnapshot(room, state, cacheRef);
      setValue(() => nextSnapshot);
    };

    sync();

    const unsubscribe = state.subscribe(() => {
      sync();
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  const setSharedValue: SharedStateSetter<T> = (nextValue) => {
    const previousValue = state.get();
    const resolvedValue = isStateUpdater(nextValue) ? nextValue(previousValue) : nextValue;

    if (areStructuredValuesEqual(previousValue, resolvedValue)) {
      return previousValue;
    }

    state.set(resolvedValue);
    setValue(() => resolvedValue);
    return resolvedValue;
  };

  return [value, setSharedValue] as const;
}

function createRoomOptions<TPresence extends PresenceData = PresenceData>(
  props: RoomfulProviderProps<TPresence>,
): RoomOptions<TPresence> {
  const options: RoomOptions<TPresence> = {};

  if (props.transport !== undefined) {
    options.transport = props.transport;
  }

  if (props.presence !== undefined) {
    options.presence = props.presence;
  }

  if (props.maxPeers !== undefined) {
    options.maxPeers = props.maxPeers;
  }

  if (props.stunUrls !== undefined) {
    options.stunUrls = props.stunUrls;
  }

  if (props.relayUrl !== undefined) {
    options.relayUrl = props.relayUrl;
  }

  if (props.relayAuth !== undefined) {
    options.relayAuth = props.relayAuth;
  }

  if (props.reconnect !== undefined) {
    options.reconnect = props.reconnect;
  }

  if (props.webrtc !== undefined) {
    options.webrtc = props.webrtc;
  }

  if (props.websocket !== undefined) {
    options.websocket = props.websocket;
  }

  if (props.encryption !== undefined) {
    options.encryption = props.encryption;
  }

  if (props.debug !== undefined) {
    options.debug = props.debug;
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
