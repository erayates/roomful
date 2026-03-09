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
  StateEngine,
  StateOptions,
} from '@flockjs/core';
import { createRoom, FlockError } from '@flockjs/core';
import type { Directive, InjectionKey, ObjectDirective, Plugin, ShallowRef } from 'vue';
import { getCurrentInstance, inject, markRaw, shallowRef, watch } from 'vue';

export interface FlockPluginOptions<
  TPresence extends PresenceData = PresenceData,
> extends RoomOptions<TPresence> {
  roomId: string;
}

export type ReadonlyRef<T> = Readonly<ShallowRef<T>>;

export interface UsePresenceResult<TPresence extends PresenceData = PresenceData> {
  self: ReadonlyRef<Peer<TPresence>>;
  others: ReadonlyRef<Peer<TPresence>[]>;
  all: ReadonlyRef<Peer<TPresence>[]>;
  update: PresenceEngine<TPresence>['update'];
  replace: PresenceEngine<TPresence>['replace'];
}

export interface UseCursorsResult<TCursor extends CursorData = CursorData> {
  ref: ShallowRef<HTMLElement | null>;
  cursors: ReadonlyRef<CursorPosition<TCursor>[]>;
  mount(element: HTMLElement): void;
  unmount(): void;
}

export interface UseAwarenessResult {
  others: ReadonlyRef<AwarenessState[]>;
  set: AwarenessEngine['set'];
  setFocus: AwarenessEngine['setFocus'];
  setSelection: AwarenessEngine['setSelection'];
  setTyping: AwarenessEngine['setTyping'];
}

export type SharedStateUpdater<T> = T | ((previous: T) => T);

export type SharedStateSetter<T> = (nextValue: SharedStateUpdater<T>) => void;

export type FlockCursorsDirective = Directive<HTMLElement, CursorOptions | undefined>;

interface FlockPluginContext {
  room: ShallowRef<Room<PresenceData>>;
}

interface PresenceSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PresenceEngine<TPresence>;
  snapshot: {
    self: Peer<TPresence>;
    others: Peer<TPresence>[];
    all: Peer<TPresence>[];
  };
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

interface MountedCursorDirectiveState {
  room: Room<PresenceData>;
  engine: CursorEngine<CursorData>;
  options: CursorOptions | undefined;
}

type EventHandlerRef<TPayload, TPresence extends PresenceData> = {
  bivarianceHack(payload: TPayload, from: Peer<TPresence>): void;
}['bivarianceHack'];

const FLOCK_CONTEXT_KEY: InjectionKey<FlockPluginContext> = Symbol('FlockPluginContext');
const sharedStateBindings = new WeakMap<Room<PresenceData>, SharedStateBinding>();

export const FlockPlugin: Plugin<FlockPluginOptions<PresenceData>> = {
  install(app, rawOptions) {
    if (!isFlockPluginOptions(rawOptions)) {
      throw new FlockError(
        'INVALID_STATE',
        'FlockPlugin requires app.use(FlockPlugin, { roomId, ...options }).',
        false,
      );
    }

    const room = markRaw(createRoom(rawOptions.roomId, createRoomOptions(rawOptions)));
    const context: FlockPluginContext = {
      room: shallowRef(room),
    };
    const directiveStates = new Map<HTMLElement, MountedCursorDirectiveState>();

    app.provide(FLOCK_CONTEXT_KEY, context);
    app.directive('flock-cursors', createFlockCursorsDirective(context, directiveStates));

    void room.connect().catch(() => {
      return undefined;
    });

    const originalUnmount = app.unmount.bind(app);
    let isCleanedUp = false;

    const cleanup = (): void => {
      if (isCleanedUp) {
        return;
      }

      isCleanedUp = true;

      for (const state of directiveStates.values()) {
        state.engine.unmount();
      }
      directiveStates.clear();
      sharedStateBindings.delete(room);

      void room.disconnect().catch(() => {
        return undefined;
      });
    };

    app.unmount = (...args) => {
      try {
        return originalUnmount(...args);
      } finally {
        cleanup();
      }
    };
  },
};

export function usePresence<
  TPresence extends PresenceData = PresenceData,
>(): UsePresenceResult<TPresence> {
  const context = useFlockContext('usePresence');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'usePresence');
  const cacheRef: { current: PresenceSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const initialSnapshot = readPresenceSnapshot(initialRoom, initialRoom.usePresence(), cacheRef);
  const self = shallowRef(initialSnapshot.self);
  const others = shallowRef(initialSnapshot.others);
  const all = shallowRef(initialSnapshot.all);

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'usePresence');
      const presence = typedRoom.usePresence();
      const syncSnapshot = (): void => {
        const nextSnapshot = readPresenceSnapshot(typedRoom, presence, cacheRef);
        if (
          self.value === nextSnapshot.self &&
          others.value === nextSnapshot.others &&
          all.value === nextSnapshot.all
        ) {
          return;
        }

        self.value = nextSnapshot.self;
        others.value = nextSnapshot.others;
        all.value = nextSnapshot.all;
      };

      syncSnapshot();

      const unsubscribe = presence.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return {
    self,
    others,
    all,
    update(data) {
      requireTypedRoom<TPresence>(context.room.value, 'usePresence').usePresence().update(data);
    },
    replace(data) {
      requireTypedRoom<TPresence>(context.room.value, 'usePresence').usePresence().replace(data);
    },
  };
}

export function useCursors<
  TCursor extends CursorData = CursorData,
  TPresence extends PresenceData = PresenceData,
>(options?: CursorOptions): UseCursorsResult<TCursor> {
  const context = useFlockContext('useCursors');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useCursors');
  const initialEngine = initialRoom.useCursors<TCursor>(options);
  const cacheRef: { current: CursorSnapshotCache<TPresence, TCursor> | null } = {
    current: null,
  };
  const ref = shallowRef<HTMLElement | null>(null);
  const cursors = shallowRef(readCursorSnapshot(initialRoom, initialEngine, cacheRef));
  const engineRef = shallowRef(initialEngine);
  let mountedEngine: CursorEngine<TCursor> | null = null;
  let mountedElement: HTMLElement | null = null;

  const syncMountedCursorEngine = (): void => {
    const element = ref.value;
    const engine = engineRef.value;

    if (element === null) {
      if (mountedEngine !== null) {
        mountedEngine.unmount();
        mountedEngine = null;
        mountedElement = null;
      }
      return;
    }

    if (mountedEngine === engine && mountedElement === element) {
      return;
    }

    mountedEngine?.unmount();
    engine.mount(element);
    mountedEngine = engine;
    mountedElement = element;
  };

  watch(
    ref,
    () => {
      syncMountedCursorEngine();
    },
    {
      flush: 'sync',
    },
  );

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useCursors');
      const engine = typedRoom.useCursors<TCursor>(options);
      engineRef.value = engine;

      const syncSnapshot = (): void => {
        const nextSnapshot = readCursorSnapshot(typedRoom, engine, cacheRef);
        if (cursors.value === nextSnapshot) {
          return;
        }

        cursors.value = nextSnapshot;
      };

      syncMountedCursorEngine();
      syncSnapshot();

      const unsubscribe = engine.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();

        if (mountedEngine === engine) {
          engine.unmount();
          mountedEngine = null;
          mountedElement = null;
        }
      });
    },
    {
      immediate: true,
    },
  );

  return {
    ref,
    cursors,
    mount(element) {
      ref.value = element;
      syncMountedCursorEngine();
    },
    unmount() {
      ref.value = null;
      syncMountedCursorEngine();
    },
  };
}

export function useSharedState<T, TPresence extends PresenceData = PresenceData>(
  key: string,
  options: StateOptions<T>,
): readonly [ReadonlyRef<T>, SharedStateSetter<T>] {
  const context = useFlockContext('useSharedState');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useSharedState');
  const initialState = bindSharedState(initialRoom, key, options);
  const cacheRef: { current: SharedStateSnapshotCache<TPresence, T> | null } = {
    current: null,
  };
  const value = shallowRef(readSharedStateSnapshot(initialRoom, initialState, cacheRef));
  const stateRef = shallowRef(initialState);

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useSharedState');
      const state = bindSharedState(typedRoom, key, options);
      stateRef.value = state;

      const syncSnapshot = (): void => {
        const nextSnapshot = readSharedStateSnapshot(typedRoom, state, cacheRef);
        if (value.value === nextSnapshot) {
          return;
        }

        value.value = nextSnapshot;
      };

      syncSnapshot();

      const unsubscribe = state.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  const setValue: SharedStateSetter<T> = (nextValue) => {
    const state = stateRef.value;
    const previousValue = state.get();
    const resolvedValue = isStateUpdater(nextValue) ? nextValue(previousValue) : nextValue;

    if (areStructuredValuesEqual(previousValue, resolvedValue)) {
      return;
    }

    state.set(resolvedValue);
  };

  return [value, setValue] as const;
}

export function useAwareness<TPresence extends PresenceData = PresenceData>(): UseAwarenessResult {
  const context = useFlockContext('useAwareness');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useAwareness');
  const cacheRef: { current: AwarenessSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const others = shallowRef(
    readAwarenessSnapshot(initialRoom, initialRoom.useAwareness(), cacheRef),
  );

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useAwareness');
      const awareness = typedRoom.useAwareness();
      const syncSnapshot = (): void => {
        const nextSnapshot = readAwarenessSnapshot(typedRoom, awareness, cacheRef);
        if (others.value === nextSnapshot) {
          return;
        }

        others.value = nextSnapshot;
      };

      syncSnapshot();

      const unsubscribe = awareness.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return {
    others,
    set(value) {
      requireTypedRoom<TPresence>(context.room.value, 'useAwareness').useAwareness().set(value);
    },
    setFocus(elementId) {
      requireTypedRoom<TPresence>(context.room.value, 'useAwareness')
        .useAwareness()
        .setFocus(elementId);
    },
    setSelection(selection) {
      requireTypedRoom<TPresence>(context.room.value, 'useAwareness')
        .useAwareness()
        .setSelection(selection);
    },
    setTyping(isTyping) {
      requireTypedRoom<TPresence>(context.room.value, 'useAwareness')
        .useAwareness()
        .setTyping(isTyping);
    },
  };
}

export function useEvent<TPayload = unknown, TPresence extends PresenceData = PresenceData>(
  name: string,
  handler: EventHandlerRef<TPayload, TPresence>,
): (payload: TPayload) => void {
  const context = useFlockContext('useEvent');
  const handlerRef = shallowRef<EventHandlerRef<unknown, TPresence>>(handler);

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useEvent');
      const unsubscribe = typedRoom.useEvents().on(name, (payload, from) => {
        handlerRef.value(payload, from);
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return (payload: TPayload): void => {
    requireTypedRoom<TPresence>(context.room.value, 'useEvent').useEvents().emit(name, payload);
  };
}

function useFlockContext(composableName: string): FlockPluginContext {
  if (getCurrentInstance() === null) {
    throw new FlockError(
      'INVALID_STATE',
      `${composableName}() must be called from setup() after app.use(FlockPlugin, options).`,
      false,
    );
  }

  const context = inject(FLOCK_CONTEXT_KEY, null);
  if (context === null) {
    throw new FlockError(
      'INVALID_STATE',
      `${composableName}() requires app.use(FlockPlugin, options).`,
      false,
    );
  }

  return context;
}

function requireTypedRoom<TPresence extends PresenceData>(
  value: unknown,
  composableName: string,
): Room<TPresence> {
  if (!isRoom<TPresence>(value)) {
    throw new FlockError(
      'INVALID_STATE',
      `${composableName}() requires app.use(FlockPlugin, options).`,
      false,
    );
  }

  return value;
}

function createRoomOptions<TPresence extends PresenceData>(
  options: FlockPluginOptions<TPresence>,
): RoomOptions<TPresence> {
  const roomOptions: RoomOptions<TPresence> = {};

  if (options.transport !== undefined) {
    roomOptions.transport = options.transport;
  }

  if (options.presence !== undefined) {
    roomOptions.presence = options.presence;
  }

  if (options.maxPeers !== undefined) {
    roomOptions.maxPeers = options.maxPeers;
  }

  if (options.stunUrls !== undefined) {
    roomOptions.stunUrls = options.stunUrls;
  }

  if (options.relayUrl !== undefined) {
    roomOptions.relayUrl = options.relayUrl;
  }

  if (options.relayAuth !== undefined) {
    roomOptions.relayAuth = options.relayAuth;
  }

  if (options.reconnect !== undefined) {
    roomOptions.reconnect = options.reconnect;
  }

  if (options.webrtc !== undefined) {
    roomOptions.webrtc = options.webrtc;
  }

  if (options.encryption !== undefined) {
    roomOptions.encryption = options.encryption;
  }

  if (options.debug !== undefined) {
    roomOptions.debug = options.debug;
  }

  return roomOptions;
}

function createFlockCursorsDirective(
  context: FlockPluginContext,
  states: Map<HTMLElement, MountedCursorDirectiveState>,
): ObjectDirective<HTMLElement, CursorOptions | undefined> {
  return {
    mounted(element, binding) {
      bindCursorDirectiveElement(context, states, element, binding.value);
    },
    updated(element, binding) {
      const room = context.room.value;
      const currentState = states.get(element) ?? null;
      if (
        currentState !== null &&
        currentState.room === room &&
        areCursorOptionsEqual(currentState.options, binding.value)
      ) {
        return;
      }

      unbindCursorDirectiveElement(states, element);
      bindCursorDirectiveElement(context, states, element, binding.value);
    },
    unmounted(element) {
      unbindCursorDirectiveElement(states, element);
    },
  };
}

function bindCursorDirectiveElement(
  context: FlockPluginContext,
  states: Map<HTMLElement, MountedCursorDirectiveState>,
  element: HTMLElement,
  options: CursorOptions | undefined,
): void {
  const room = requireTypedRoom<PresenceData>(context.room.value, 'v-flock-cursors');
  const engine = room.useCursors(options);
  engine.mount(element);
  states.set(element, {
    room,
    engine,
    options,
  });
}

function unbindCursorDirectiveElement(
  states: Map<HTMLElement, MountedCursorDirectiveState>,
  element: HTMLElement,
): void {
  const state = states.get(element) ?? null;
  if (state === null) {
    return;
  }

  state.engine.unmount();
  states.delete(element);
}

function bindSharedState<T, TPresence extends PresenceData>(
  room: Room<TPresence>,
  key: string,
  options: StateOptions<T>,
): StateEngine<T> {
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

  return state;
}

function readPresenceSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  cacheRef: { current: PresenceSnapshotCache<TPresence> | null },
): {
  self: Peer<TPresence>;
  others: Peer<TPresence>[];
  all: Peer<TPresence>[];
} {
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

    const nextSnapshot = {
      self: isSelfEqual ? previousSnapshot.self : self,
      others: isOthersEqual ? previousSnapshot.others : others,
      all: isAllEqual ? previousSnapshot.all : all,
    };

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  const snapshot = {
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

    if (
      previousPeer === undefined ||
      nextPeer === undefined ||
      !arePeersEqual(previousPeer, nextPeer)
    ) {
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

    if (
      previousCursor === undefined ||
      nextCursor === undefined ||
      !areCursorPositionsEqual(previousCursor, nextCursor)
    ) {
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

function areAwarenessArraysEqual(
  previous: readonly AwarenessState[],
  next: readonly AwarenessState[],
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

    if (
      previousEntry === undefined ||
      nextEntry === undefined ||
      !areStructuredValuesEqual(previousEntry, nextEntry)
    ) {
      return false;
    }
  }

  return true;
}

function areCursorOptionsEqual(
  previous: CursorOptions | undefined,
  next: CursorOptions | undefined,
): boolean {
  return areShallowObjectsEqual(previous, next);
}

function areShallowObjectsEqual(a: object | undefined, b: object | undefined): boolean {
  if (a === b) {
    return true;
  }

  if (a === undefined || b === undefined) {
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

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStateUpdater<T>(value: SharedStateUpdater<T>): value is (previous: T) => T {
  return typeof value === 'function';
}

function isFlockPluginOptions(value: unknown): value is FlockPluginOptions<PresenceData> {
  return isObjectLike(value) && typeof Reflect.get(value, 'roomId') === 'string';
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

declare module 'vue' {
  interface GlobalDirectives {
    vFlockCursors: FlockCursorsDirective;
  }
}
