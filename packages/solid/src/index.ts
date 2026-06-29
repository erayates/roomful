import type {
  AwarenessEngine,
  AwarenessState,
  CursorData,
  CursorEngine,
  CursorOptions,
  CursorPosition,
  LockAcquireOptions,
  LockEngine,
  LockState,
  Peer,
  PresenceData,
  PresenceEngine,
  Room,
  RoomOptions,
  RoomStatus,
  StateEngine,
  StateOptions,
  ViewportEngine,
  ViewportOptions,
  ViewportState,
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
 * Describes the return value of `useViewport`.
 */
export interface UseViewportResult {
  /**
   * Callback ref that mounts the viewport engine on a scrollable container.
   *
   * @param element - The element to observe, or `null` to unmount.
   * @returns Nothing.
   */
  ref(element: HTMLElement | null): void;

  /**
   * Exposes remote peer viewport states only.
   */
  states: Accessor<ViewportState[]>;

  /**
   * Mounts viewport tracking on a scrollable container.
   *
   * @param element - The element to observe.
   * @returns Nothing.
   */
  mount(element: HTMLElement): void;

  /**
   * Unmounts viewport tracking.
   *
   * @returns Nothing.
   */
  unmount(): void;

  /**
   * Starts streaming the local viewport to all peers.
   */
  broadcast: ViewportEngine['broadcast'];

  /**
   * Stops streaming the local viewport.
   */
  stopBroadcast: ViewportEngine['stopBroadcast'];

  /**
   * Enters present mode, forcing peers to follow the local viewport.
   */
  present: ViewportEngine['present'];

  /**
   * Leaves present mode and releases following peers.
   */
  stopPresenting: ViewportEngine['stopPresenting'];

  /**
   * Follows a specific peer's viewport.
   */
  follow: ViewportEngine['follow'];

  /**
   * Stops following any peer and resumes independent scrolling.
   */
  unfollow: ViewportEngine['unfollow'];
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

/**
 * Describes the return value of `useLocks`.
 */
export interface UseLocksResult {
  /**
   * Exposes the resolved state of every currently-held lock.
   */
  locks: Accessor<LockState[]>;

  /**
   * Claims exclusive ownership of a key, resolving whether the local peer holds
   * it.
   *
   * @param key - The lock key to claim.
   * @param options - Optional TTL and acquire-timeout configuration.
   * @returns A promise resolving to whether the local peer holds the key.
   */
  acquire(key: string, options?: LockAcquireOptions): Promise<boolean>;

  /**
   * Releases a lock held by the local peer.
   */
  release: LockEngine['release'];

  /**
   * Releases every lock held by the local peer.
   */
  releaseAll: LockEngine['releaseAll'];

  /**
   * Reports whether a key is currently held by any peer.
   */
  isLocked: LockEngine['isLocked'];

  /**
   * Returns the peer currently holding a key, or `null`.
   */
  getHolder: LockEngine['getHolder'];
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

interface ViewportSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: ViewportEngine;
  snapshot: ViewportState[];
}

interface LocksSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: LockEngine;
  snapshot: LockState[];
}

interface LockStateSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: LockEngine;
  key: string;
  snapshot: LockState | null;
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
 * Subscribes to viewport snapshots and returns mounting and control helpers.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional viewport tracking configuration.
 * @returns The remote viewport states plus mounting and follow controls.
 */
export function useViewport<TPresence extends PresenceData = PresenceData>(
  options?: ViewportOptions,
): UseViewportResult {
  const room = useRoom<TPresence>();
  const viewportEngine = room.useViewport(options);
  const cacheRef: { current: ViewportSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const [states, setStates] = createSignal(readViewportSnapshot(room, viewportEngine, cacheRef));

  let trackedElement: HTMLElement | null = null;
  let mounted = false;

  const mount = (element: HTMLElement): void => {
    if (trackedElement === element) {
      return;
    }

    if (trackedElement !== null) {
      viewportEngine.unmount();
    }

    trackedElement = element;
    viewportEngine.mount(element);
    mounted = true;
  };

  const unmount = (): void => {
    if (trackedElement === null) {
      return;
    }

    viewportEngine.unmount();
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
      const nextSnapshot = readViewportSnapshot(room, viewportEngine, cacheRef);
      setStates(() => nextSnapshot);
    };

    sync();

    const unsubscribe = viewportEngine.subscribe(() => {
      sync();
    });

    onCleanup(() => {
      unsubscribe();

      if (mounted) {
        viewportEngine.unmount();
        trackedElement = null;
        mounted = false;
      }
    });
  });

  return {
    ref,
    states,
    mount,
    unmount,
    broadcast: () => {
      viewportEngine.broadcast();
    },
    stopBroadcast: () => {
      viewportEngine.stopBroadcast();
    },
    present: () => {
      viewportEngine.present();
    },
    stopPresenting: () => {
      viewportEngine.stopPresenting();
    },
    follow: (peerId) => {
      viewportEngine.follow(peerId);
    },
    unfollow: () => {
      viewportEngine.unfollow();
    },
  };
}

/**
 * Subscribes to all lock states and returns the lock engine controls.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The held lock states accessor plus acquire/release controls.
 */
export function useLocks<TPresence extends PresenceData = PresenceData>(): UseLocksResult {
  const room = useRoom<TPresence>();
  const lockEngine = room.useLocks();
  const cacheRef: { current: LocksSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const [locks, setLocks] = createSignal(readLocksSnapshot(room, lockEngine, cacheRef));

  onMount(() => {
    const sync = (): void => {
      const nextSnapshot = readLocksSnapshot(room, lockEngine, cacheRef);
      setLocks(() => nextSnapshot);
    };

    sync();

    const unsubscribe = lockEngine.subscribeAll(() => {
      sync();
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  return {
    locks,
    acquire: (key, options) => {
      return lockEngine.acquire(key, options);
    },
    release: (key) => {
      lockEngine.release(key);
    },
    releaseAll: () => {
      lockEngine.releaseAll();
    },
    isLocked: (key) => {
      return lockEngine.isLocked(key);
    },
    getHolder: (key) => {
      return lockEngine.getHolder(key);
    },
  };
}

/**
 * Subscribes to the resolved state of a single lock key (the lock-on-focus
 * pattern: read `holder` to decide whether the local peer owns the key).
 *
 * @typeParam TPresence - The room presence shape.
 * @param key - The lock key to observe.
 * @returns The current lock state accessor, resolving to `null` when free.
 */
export function useLockState<TPresence extends PresenceData = PresenceData>(
  key: string,
): Accessor<LockState | null> {
  const room = useRoom<TPresence>();
  const lockEngine = room.useLocks();
  const cacheRef: { current: LockStateSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const [state, setState] = createSignal(readLockStateSnapshot(room, lockEngine, key, cacheRef));

  onMount(() => {
    setState(() => readLockStateSnapshot(room, lockEngine, key, cacheRef));

    const unsubscribe = lockEngine.subscribe(key, (lockState) => {
      setState(() => reconcileLockStateSnapshot(room, lockEngine, key, lockState, cacheRef));
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  return state;
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

function areViewportArraysEqual(
  previous: readonly ViewportState[],
  next: readonly ViewportState[],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousEntry = previous[index];
    const nextEntry = next[index];

    if (!previousEntry || !nextEntry || !areStructuredValuesEqual(previousEntry, nextEntry)) {
      return false;
    }
  }

  return true;
}

function readViewportSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  viewport: ViewportEngine,
  cacheRef: { current: ViewportSnapshotCache<TPresence> | null },
): ViewportState[] {
  const nextSnapshot = viewport.getAll();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === viewport) {
    const previousSnapshot = previous.snapshot;
    if (areViewportArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((state, index) => {
      const previousState = previousSnapshot[index];
      if (previousState !== undefined && areStructuredValuesEqual(previousState, state)) {
        return previousState;
      }

      return state;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: viewport,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function areLockArraysEqual(previous: readonly LockState[], next: readonly LockState[]): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousEntry = previous[index];
    const nextEntry = next[index];

    if (!previousEntry || !nextEntry || !areStructuredValuesEqual(previousEntry, nextEntry)) {
      return false;
    }
  }

  return true;
}

function readLocksSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  cacheRef: { current: LocksSnapshotCache<TPresence> | null },
): LockState[] {
  const nextSnapshot = locks.getAll();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === locks) {
    const previousSnapshot = previous.snapshot;
    if (areLockArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((state, index) => {
      const previousState = previousSnapshot[index];
      if (previousState !== undefined && areStructuredValuesEqual(previousState, state)) {
        return previousState;
      }

      return state;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: locks,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function resolveSingleLockState(locks: LockEngine, key: string): LockState | null {
  const holder = locks.getHolder(key);
  if (!holder) {
    return null;
  }

  return (
    locks.getAll().find((state) => {
      return state.key === key;
    }) ?? null
  );
}

function commitLockStateSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  key: string,
  nextState: LockState | null,
  cacheRef: { current: LockStateSnapshotCache<TPresence> | null },
): LockState | null {
  const previous = cacheRef.current;

  if (
    previous !== null &&
    previous.room === room &&
    previous.engine === locks &&
    previous.key === key
  ) {
    const previousSnapshot = previous.snapshot;
    if (
      previousSnapshot === nextState ||
      (previousSnapshot !== null &&
        nextState !== null &&
        areStructuredValuesEqual(previousSnapshot, nextState))
    ) {
      return previousSnapshot;
    }

    previous.snapshot = nextState;
    return nextState;
  }

  cacheRef.current = {
    room,
    engine: locks,
    key,
    snapshot: nextState,
  };
  return nextState;
}

function readLockStateSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  key: string,
  cacheRef: { current: LockStateSnapshotCache<TPresence> | null },
): LockState | null {
  return commitLockStateSnapshot(room, locks, key, resolveSingleLockState(locks, key), cacheRef);
}

function reconcileLockStateSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  key: string,
  state: LockState,
  cacheRef: { current: LockStateSnapshotCache<TPresence> | null },
): LockState | null {
  const nextState = state.holder === null ? null : state;
  return commitLockStateSnapshot(room, locks, key, nextState, cacheRef);
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
    hasFunction(value, 'useViewport') &&
    hasFunction(value, 'useLocks') &&
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
