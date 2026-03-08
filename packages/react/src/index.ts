import type {
  CursorData,
  CursorEngine,
  CursorOptions,
  CursorPosition,
  Peer,
  PresenceData,
  PresenceEngine,
  Room,
  RoomOptions,
  StateEngine,
  StateOptions,
} from '@flockjs/core';
import { createCoreHealth, createRoom, FlockError } from '@flockjs/core';
import type { Dispatch, ReactNode, RefCallback, SetStateAction } from 'react';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';

export interface ReactHealth {
  packageName: '@flockjs/react';
  status: 'ok';
  dependencies: {
    core: ReturnType<typeof createCoreHealth>;
  };
}

export interface FlockProviderProps<
  TPresence extends PresenceData = PresenceData,
> extends RoomOptions<TPresence> {
  roomId: string;
  children?: ReactNode;
  onConnect?: () => void;
  onDisconnect?: (payload: { reason?: string }) => void;
  onError?: (error: FlockError) => void;
}

export interface UsePresenceResult<TPresence extends PresenceData = PresenceData> {
  self: Peer<TPresence>;
  others: Peer<TPresence>[];
  all: Peer<TPresence>[];
  update: PresenceEngine<TPresence>['update'];
  replace: PresenceEngine<TPresence>['replace'];
}

export interface UseCursorsResult<TCursor extends CursorData = CursorData> {
  ref: RefCallback<HTMLElement>;
  cursors: CursorPosition<TCursor>[];
  mount(element: HTMLElement): void;
  unmount(): void;
}

interface RoomDefinition<TPresence extends PresenceData> {
  roomId: string;
  options: RoomOptions<TPresence>;
}

interface RoomSlot<TPresence extends PresenceData> {
  definition: RoomDefinition<TPresence>;
  room: Room<TPresence>;
}

interface ProviderCallbacks {
  onConnect: (() => void) | undefined;
  onDisconnect: ((payload: { reason?: string }) => void) | undefined;
  onError: ((error: FlockError) => void) | undefined;
}

interface PresenceSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PresenceEngine<TPresence>;
  snapshot: UsePresenceResult<TPresence>;
}

interface CursorSnapshotCache<TPresence extends PresenceData, TCursor extends CursorData> {
  room: Room<TPresence>;
  engine: CursorEngine<TCursor>;
  snapshot: CursorPosition<TCursor>[];
}

interface SharedStateSnapshotCache<TPresence extends PresenceData, T> {
  room: Room<TPresence>;
  engine: StateEngine<T>;
  snapshot: T;
}

interface SharedStateBinding {
  key: string;
  strategy: 'lww' | 'crdt';
  initialValue: unknown;
  persist: boolean;
}

const sharedStateBindings = new WeakMap<Room<PresenceData>, SharedStateBinding>();

const FlockRoomContext = createContext<unknown>(null);
FlockRoomContext.displayName = 'FlockRoomContext';

export function createReactHealth(): ReactHealth {
  return {
    packageName: '@flockjs/react',
    status: 'ok',
    dependencies: {
      core: createCoreHealth(),
    },
  };
}

export function FlockProvider<TPresence extends PresenceData = PresenceData>(
  props: FlockProviderProps<TPresence>,
): ReactNode {
  const callbacksRef = useRef<ProviderCallbacks>({
    onConnect: props.onConnect,
    onDisconnect: props.onDisconnect,
    onError: props.onError,
  });
  callbacksRef.current = {
    onConnect: props.onConnect,
    onDisconnect: props.onDisconnect,
    onError: props.onError,
  };

  const roomDefinition = createRoomDefinition(props);
  const roomSlotRef = useRef<RoomSlot<TPresence> | null>(null);
  let roomSlot = roomSlotRef.current;

  if (roomSlot === null || !areRoomDefinitionsEqual(roomSlot.definition, roomDefinition)) {
    roomSlot = {
      definition: roomDefinition,
      room: createRoom(roomDefinition.roomId, roomDefinition.options),
    };
    roomSlotRef.current = roomSlot;
  }

  const room = roomSlot.room;

  useEffect(() => {
    const unsubscribeConnected = room.on('connected', () => {
      callbacksRef.current.onConnect?.();
    });
    const unsubscribeDisconnected = room.on('disconnected', (payload) => {
      callbacksRef.current.onDisconnect?.(payload);
    });
    const unsubscribeError = room.on('error', (error) => {
      callbacksRef.current.onError?.(error);
    });

    void room.connect().catch(() => {
      return undefined;
    });

    return () => {
      unsubscribeError();
      unsubscribeDisconnected();
      unsubscribeConnected();

      void room.disconnect().catch(() => {
        return undefined;
      });
    };
  }, [room]);

  return createElement(FlockRoomContext.Provider, { value: room }, props.children);
}

export function useRoom<TPresence extends PresenceData = PresenceData>(): Room<TPresence> {
  const room = useContext(FlockRoomContext);

  if (!isRoom<TPresence>(room)) {
    throw new FlockError('INVALID_STATE', 'useRoom() must be used within a FlockProvider.', false);
  }

  return room;
}

export function usePresence<
  TPresence extends PresenceData = PresenceData,
>(): UsePresenceResult<TPresence> {
  const room = useRoom<TPresence>();
  const presence = room.usePresence();
  const snapshotCacheRef = useRef<PresenceSnapshotCache<TPresence> | null>(null);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return presence.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readPresenceSnapshot(room, presence, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [presence, room],
  );
  const getSnapshot = useCallback(() => {
    return readPresenceSnapshot(room, presence, snapshotCacheRef);
  }, [presence, room]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useCursors<
  TCursor extends CursorData = CursorData,
  TPresence extends PresenceData = PresenceData,
>(options?: CursorOptions): UseCursorsResult<TCursor> {
  const room = useRoom<TPresence>();
  const optionsRef = useRef(options);
  const cursorEngine = room.useCursors<TCursor>(optionsRef.current);
  const snapshotCacheRef = useRef<CursorSnapshotCache<TPresence, TCursor> | null>(null);
  const trackedElementRef = useRef<HTMLElement | null>(null);
  const mountedEngineRef = useRef<CursorEngine<TCursor> | null>(null);

  const mount = useCallback(
    (element: HTMLElement) => {
      const previousElement = trackedElementRef.current;
      trackedElementRef.current = element;

      if (mountedEngineRef.current === cursorEngine && previousElement === element) {
        return;
      }

      mountedEngineRef.current?.unmount();
      cursorEngine.mount(element);
      mountedEngineRef.current = cursorEngine;
    },
    [cursorEngine],
  );

  const unmount = useCallback(() => {
    trackedElementRef.current = null;
    mountedEngineRef.current?.unmount();
    mountedEngineRef.current = null;
  }, []);

  const ref = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      if (element === null) {
        unmount();
        return;
      }

      mount(element);
    },
    [mount, unmount],
  );

  useEffect(() => {
    const trackedElement = trackedElementRef.current;
    if (trackedElement && mountedEngineRef.current !== cursorEngine) {
      mountedEngineRef.current?.unmount();
      cursorEngine.mount(trackedElement);
      mountedEngineRef.current = cursorEngine;
    }
  }, [cursorEngine]);

  useEffect(() => {
    return () => {
      trackedElementRef.current = null;
      mountedEngineRef.current?.unmount();
      mountedEngineRef.current = null;
    };
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return cursorEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readCursorSnapshot(room, cursorEngine, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [cursorEngine, room],
  );
  const getSnapshot = useCallback(() => {
    return readCursorSnapshot(room, cursorEngine, snapshotCacheRef);
  }, [cursorEngine, room]);

  return {
    ref,
    cursors: useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    mount,
    unmount,
  };
}

export function useSharedState<T, TPresence extends PresenceData = PresenceData>(
  key: string,
  options: StateOptions<T>,
): readonly [T, Dispatch<SetStateAction<T>>] {
  const room = useRoom<TPresence>();
  const existingBinding = sharedStateBindings.get(room) ?? null;

  if (existingBinding) {
    assertCompatibleSharedStateBinding(existingBinding, key, options);
  }

  const state = room.useState(options);
  const binding = existingBinding ?? createSharedStateBinding(key, options);
  sharedStateBindings.set(room, binding);

  if (binding.persist !== true && options.persist === true && binding.strategy === 'lww') {
    binding.persist = true;
  }

  const stateRef = useRef(state);
  stateRef.current = state;

  const snapshotCacheRef = useRef<SharedStateSnapshotCache<TPresence, T> | null>(null);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return state.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readSharedStateSnapshot(room, state, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [room, state],
  );
  const getSnapshot = useCallback(() => {
    return readSharedStateSnapshot(room, state, snapshotCacheRef);
  }, [room, state]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    const engine = stateRef.current;
    const previousValue = engine.get();
    const resolvedValue = isStateUpdater(nextValue) ? nextValue(previousValue) : nextValue;

    if (areStructuredValuesEqual(previousValue, resolvedValue)) {
      return;
    }

    engine.set(resolvedValue);
  }, []);

  return [useSyncExternalStore(subscribe, getSnapshot, getSnapshot), setValue] as const;
}

function createRoomDefinition<TPresence extends PresenceData = PresenceData>(
  props: FlockProviderProps<TPresence>,
): RoomDefinition<TPresence> {
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

  if (props.encryption !== undefined) {
    options.encryption = props.encryption;
  }

  if (props.debug !== undefined) {
    options.debug = props.debug;
  }

  return {
    roomId: props.roomId,
    options,
  };
}

function areRoomDefinitionsEqual<TPresence extends PresenceData = PresenceData>(
  a: RoomDefinition<TPresence>,
  b: RoomDefinition<TPresence>,
): boolean {
  return a.roomId === b.roomId && areRoomOptionsEqual(a.options, b.options);
}

function areRoomOptionsEqual<TPresence extends PresenceData = PresenceData>(
  a: RoomOptions<TPresence>,
  b: RoomOptions<TPresence>,
): boolean {
  return (
    a.transport === b.transport &&
    areShallowArraysEqual(a.stunUrls, b.stunUrls) &&
    areShallowObjectsEqual(a.presence, b.presence) &&
    a.maxPeers === b.maxPeers &&
    a.relayUrl === b.relayUrl &&
    a.relayAuth === b.relayAuth &&
    areShallowValuesEqual(a.reconnect, b.reconnect) &&
    areShallowObjectsEqual(a.webrtc, b.webrtc) &&
    areShallowValuesEqual(a.encryption, b.encryption) &&
    areShallowValuesEqual(a.debug, b.debug)
  );
}

function areShallowArraysEqual<T>(
  a: readonly T[] | undefined,
  b: readonly T[] | undefined,
): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b || a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}

function areShallowValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (!isObjectLike(a) || !isObjectLike(b)) {
    return false;
  }

  return areShallowObjectsEqual(a, b);
}

function areShallowObjectsEqual(a: object | undefined, b: object | undefined): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      Reflect.get(a, key) !== Reflect.get(b, key)
    ) {
      return false;
    }
  }

  return true;
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPresenceSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  cacheRef: { current: PresenceSnapshotCache<TPresence> | null },
): UsePresenceResult<TPresence> {
  const all = presence.getAll();
  const self = readSelfPeer(room, presence, all);
  const others = all.filter((peer) => {
    return peer.id !== room.peerId;
  });
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === presence) {
    const previousSnapshot = previous.snapshot;
    const isAllEqual = arePeerArraysEqual(previousSnapshot.all, all);
    const isSelfEqual = arePeersEqual(previousSnapshot.self, self);
    const isOthersEqual = arePeerArraysEqual(previousSnapshot.others, others);

    if (isAllEqual && isSelfEqual && isOthersEqual) {
      return previousSnapshot;
    }

    const nextSnapshot: UsePresenceResult<TPresence> = {
      self: isSelfEqual ? previousSnapshot.self : self,
      others: isOthersEqual ? previousSnapshot.others : others,
      all: isAllEqual ? previousSnapshot.all : all,
      update: previousSnapshot.update,
      replace: previousSnapshot.replace,
    };

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  const snapshot: UsePresenceResult<TPresence> = {
    self,
    others,
    all,
    update: presence.update,
    replace: presence.replace,
  };

  cacheRef.current = {
    room,
    engine: presence,
    snapshot,
  };

  return snapshot;
}

function readSelfPeer<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  peers: Peer<TPresence>[],
): Peer<TPresence> {
  for (const peer of peers) {
    if (peer.id === room.peerId) {
      return peer;
    }
  }

  return presence.getSelf();
}

function arePeerArraysEqual<TPresence extends PresenceData>(
  previous: readonly Peer<TPresence>[],
  next: readonly Peer<TPresence>[],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousPeer = previous[index];
    const nextPeer = next[index];

    if (!previousPeer || !nextPeer || !arePeersEqual(previousPeer, nextPeer)) {
      return false;
    }
  }

  return true;
}

function readCursorSnapshot<TPresence extends PresenceData, TCursor extends CursorData>(
  room: Room<TPresence>,
  cursors: CursorEngine<TCursor>,
  cacheRef: { current: CursorSnapshotCache<TPresence, TCursor> | null },
): CursorPosition<TCursor>[] {
  const nextSnapshot = cursors.getPositions();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === cursors) {
    const previousSnapshot = previous.snapshot;
    if (areCursorArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((position, index) => {
      const previousPosition = previousSnapshot[index];
      if (previousPosition && areCursorPositionsEqual(previousPosition, position)) {
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

function readSharedStateSnapshot<TPresence extends PresenceData, T>(
  room: Room<TPresence>,
  state: StateEngine<T>,
  cacheRef: { current: SharedStateSnapshotCache<TPresence, T> | null },
): T {
  const nextSnapshot = state.get();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === state) {
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

function createSharedStateBinding<T>(key: string, options: StateOptions<T>): SharedStateBinding {
  return {
    key,
    strategy: normalizeSharedStateStrategy(options.strategy),
    initialValue: cloneSharedStateValue(options.initialValue),
    persist: options.persist === true,
  };
}

function assertCompatibleSharedStateBinding<T>(
  binding: SharedStateBinding,
  key: string,
  options: StateOptions<T>,
): void {
  if (binding.key !== key) {
    throw new FlockError(
      'INVALID_STATE',
      `useSharedState() is already bound to key "${binding.key}" for this room.`,
      false,
      {
        currentKey: binding.key,
        requestedKey: key,
      },
    );
  }

  const normalizedStrategy = normalizeSharedStateStrategy(options.strategy, binding.strategy);
  if (binding.strategy !== normalizedStrategy) {
    throw new FlockError(
      'INVALID_STATE',
      `useSharedState("${key}") is already configured with strategy "${binding.strategy}".`,
      false,
      {
        currentStrategy: binding.strategy,
        requestedStrategy: normalizedStrategy,
      },
    );
  }

  if (!areStructuredValuesEqual(binding.initialValue, options.initialValue)) {
    throw new FlockError(
      'INVALID_STATE',
      `useSharedState("${key}") received a different initialValue for the same room.`,
      false,
    );
  }

  const requestedPersist = options.persist === true;
  if (binding.persist === requestedPersist) {
    return;
  }

  if (!binding.persist && requestedPersist && binding.strategy === 'lww') {
    return;
  }

  if (requestedPersist && binding.strategy !== 'lww') {
    throw new FlockError(
      'INVALID_STATE',
      'State persistence is only supported for the "lww" strategy.',
      false,
      {
        strategy: binding.strategy,
        persist: requestedPersist,
      },
    );
  }

  throw new FlockError(
    'INVALID_STATE',
    `useSharedState("${key}") persistence is already enabled for this room.`,
    false,
    {
      persist: binding.persist,
      requestedPersist,
    },
  );
}

function normalizeSharedStateStrategy(
  strategy: StateOptions<unknown>['strategy'],
  currentStrategy?: 'lww' | 'crdt',
): 'lww' | 'crdt' {
  const normalized = strategy ?? currentStrategy ?? 'lww';
  if (normalized === 'lww' || normalized === 'crdt') {
    return normalized;
  }

  throw new FlockError(
    'INVALID_STATE',
    `State strategy "${normalized}" is not implemented in this runtime. Use "lww" or "crdt".`,
    false,
    {
      strategy: normalized,
    },
  );
}

function cloneSharedStateValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return value;
}

function areCursorArraysEqual<TCursor extends CursorData>(
  previous: readonly CursorPosition<TCursor>[],
  next: readonly CursorPosition<TCursor>[],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousCursor = previous[index];
    const nextCursor = next[index];

    if (!previousCursor || !nextCursor || !areCursorPositionsEqual(previousCursor, nextCursor)) {
      return false;
    }
  }

  return true;
}

function areCursorPositionsEqual<TCursor extends CursorData>(
  previous: CursorPosition<TCursor>,
  next: CursorPosition<TCursor>,
): boolean {
  if (previous === next) {
    return true;
  }

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      return false;
    }

    if (!areStructuredValuesEqual(Reflect.get(previous, key), Reflect.get(next, key))) {
      return false;
    }
  }

  return true;
}

function arePeersEqual<TPresence extends PresenceData>(
  previous: Peer<TPresence>,
  next: Peer<TPresence>,
): boolean {
  if (previous === next) {
    return true;
  }

  const previousKeys = Object.keys(previous).filter((key) => {
    return key !== 'lastSeen';
  });
  const nextKeys = Object.keys(next).filter((key) => {
    return key !== 'lastSeen';
  });

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      return false;
    }

    if (!areStructuredValuesEqual(Reflect.get(previous, key), Reflect.get(next, key))) {
      return false;
    }
  }

  return true;
}

function areStructuredValuesEqual(previous: unknown, next: unknown): boolean {
  if (previous === next) {
    return true;
  }

  if (Array.isArray(previous) || Array.isArray(next)) {
    if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== next.length) {
      return false;
    }

    for (let index = 0; index < previous.length; index += 1) {
      if (!areStructuredValuesEqual(previous[index], next[index])) {
        return false;
      }
    }

    return true;
  }

  if (!isPlainObject(previous) || !isPlainObject(next)) {
    return false;
  }

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      return false;
    }

    if (!areStructuredValuesEqual(Reflect.get(previous, key), Reflect.get(next, key))) {
      return false;
    }
  }

  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObjectLike(value)) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
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
