// @vitest-environment jsdom

import type {
  AwarenessEngine,
  AwarenessState,
  CursorData,
  CursorEngine,
  CursorPosition,
  EventEngine,
  LockEngine,
  LockState,
  Peer,
  PointerBeam,
  PointerEngine,
  PresenceData,
  PresenceEngine,
  Room,
  RoomEventMap,
  RoomEventName,
  RoomOptions,
  RoomStatus,
  StateChangeMeta,
  StateEngine,
  ViewportEngine,
  ViewportState,
} from '@roomful/core';
import { RoomfulError } from '@roomful/core';
import type { Action } from 'svelte/action';
import type { Writable } from 'svelte/store';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const { createRoomMock, lifecycleState } = vi.hoisted(() => {
  return {
    createRoomMock: vi.fn(),
    lifecycleState: {
      destroyCallbacks: [] as Array<() => void>,
      failRegistration: false,
      mountCallbacks: [] as Array<() => void>,
    },
  };
});

vi.mock('svelte', async () => {
  const actual = await vi.importActual<typeof import('svelte')>('svelte');

  return {
    ...actual,
    onDestroy: vi.fn((callback: () => void) => {
      if (lifecycleState.failRegistration) {
        throw new Error('lifecycle unavailable');
      }

      lifecycleState.destroyCallbacks.push(callback);
    }),
    onMount: vi.fn((callback: () => void) => {
      if (lifecycleState.failRegistration) {
        throw new Error('lifecycle unavailable');
      }

      lifecycleState.mountCallbacks.push(callback);
    }),
  };
});

vi.mock('@roomful/core', async () => {
  const actual = await vi.importActual<typeof import('@roomful/core')>('@roomful/core');

  return {
    ...actual,
    createRoom: createRoomMock,
  };
});

import type { AwarenessStoreValue, EventChannelValue, PresenceStoreValue } from './index';
import { roomful } from './index';

type RoomEventPayload = RoomEventMap<PresenceData>[RoomEventName];
type RoomEventHandler = (payload: RoomEventPayload) => void;
type AwarenessSubscriber = (peers: AwarenessState[]) => void;
type CursorSubscriber = (positions: CursorPosition<CursorData>[]) => void;
type EventSubscriber = (payload: unknown, from: Peer<PresenceData>) => void;
type PresenceSubscriber = (peers: Peer<PresenceData>[]) => void;
type StateSubscriber<T> = (value: T, meta: StateChangeMeta) => void;
type ViewportSubscriber = (states: ViewportState[]) => void;
type PointerSubscriber = (beams: PointerBeam[]) => void;
type LockStateSubscriber = (state: LockState) => void;
type LocksSubscriber = (states: LockState[]) => void;

type TestPresenceEngine = PresenceEngine<PresenceData> & {
  emit(peers: Peer<PresenceData>[]): void;
  subscriberCount(): number;
  replace: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
  subscribe: ReturnType<typeof vi.fn<(cb: PresenceSubscriber) => () => void>>;
  update: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
};

type TestCursorEngine = CursorEngine<CursorData> & {
  emit(positions: CursorPosition<CursorData>[]): void;
  getPositions: ReturnType<typeof vi.fn<() => CursorPosition<CursorData>[]>>;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  render: ReturnType<typeof vi.fn<() => void>>;
  setPosition: ReturnType<typeof vi.fn<(position: Partial<CursorPosition<CursorData>>) => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: CursorSubscriber) => () => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
};

type TestViewportEngine = ViewportEngine & {
  broadcast: ReturnType<typeof vi.fn<() => void>>;
  emit(states: ViewportState[]): void;
  follow: ReturnType<typeof vi.fn<(peerId: string) => void>>;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  present: ReturnType<typeof vi.fn<() => void>>;
  stopBroadcast: ReturnType<typeof vi.fn<() => void>>;
  stopPresenting: ReturnType<typeof vi.fn<() => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: ViewportSubscriber) => () => void>>;
  unfollow: ReturnType<typeof vi.fn<() => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
};

type TestPointerEngine = PointerEngine & {
  activate: ReturnType<typeof vi.fn<() => void>>;
  deactivate: ReturnType<typeof vi.fn<() => void>>;
  emit(beams: PointerBeam[]): void;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  render: ReturnType<typeof vi.fn<() => () => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: PointerSubscriber) => () => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
};

type TestLockEngine = LockEngine & {
  acquire: ReturnType<typeof vi.fn<(key: string) => Promise<boolean>>>;
  allSubscriberCount(): number;
  emitAll(states: LockState[]): void;
  emitKey(key: string, state: LockState): void;
  keySubscriberCount(key: string): number;
  release: ReturnType<typeof vi.fn<(key: string) => void>>;
  releaseAll: ReturnType<typeof vi.fn<() => void>>;
  setHolder(key: string, holder: Peer<PresenceData> | null): void;
};

type TestAwarenessEngine = AwarenessEngine & {
  emit(peers: AwarenessState[]): void;
  set: ReturnType<typeof vi.fn<(value: Record<string, unknown>) => void>>;
  setFocus: ReturnType<typeof vi.fn<(elementId: string | null) => void>>;
  setSelection: ReturnType<typeof vi.fn<(selection: AwarenessState['selection'] | null) => void>>;
  setTyping: ReturnType<typeof vi.fn<(isTyping: boolean) => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: AwarenessSubscriber) => () => void>>;
};

type TestEventEngine = EventEngine<PresenceData> & {
  deliver(name: string, payload: unknown, from?: Peer<PresenceData>): void;
  emit: ReturnType<typeof vi.fn<(name: string, payload: unknown) => void>>;
  emitTo: ReturnType<typeof vi.fn<(peerId: string, name: string, payload: unknown) => void>>;
  on: ReturnType<typeof vi.fn<(name: string, cb: EventSubscriber) => () => void>>;
  subscriberCount(name: string): number;
};

type TestStateEngine<T> = StateEngine<T> & {
  emit(value: T, meta?: StateChangeMeta): void;
  get: ReturnType<typeof vi.fn<() => T>>;
  set: ReturnType<typeof vi.fn<(value: T) => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: StateSubscriber<T>) => () => void>>;
};

type TestRoom = Room<PresenceData> & {
  awarenessEngine: TestAwarenessEngine;
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  cursorEngine: TestCursorEngine;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  emit: <TEvent extends RoomEventName>(
    event: TEvent,
    payload: RoomEventMap<PresenceData>[TEvent],
  ) => void;
  eventEngine: TestEventEngine;
  listenerCount(event: RoomEventName): number;
  lockEngine: TestLockEngine;
  pointerEngine: TestPointerEngine;
  presenceEngine: TestPresenceEngine;
  setStatus(status: RoomStatus): void;
  stateEngine: TestStateEngine<unknown>;
  viewportEngine: TestViewportEngine;
};

function createPeer(id: string, overrides: Partial<Peer<PresenceData>> = {}): Peer<PresenceData> {
  return {
    id,
    joinedAt: 1,
    lastSeen: 1,
    name: id,
    ...overrides,
  };
}

function createCursor(
  userId: string,
  overrides: Partial<CursorPosition<CursorData>> = {},
): CursorPosition<CursorData> {
  return {
    color: '#111111',
    idle: false,
    name: userId,
    userId,
    x: 0.25,
    xAbsolute: 25,
    y: 0.75,
    yAbsolute: 75,
    ...overrides,
  };
}

function createAwareness(peerId: string, overrides: Partial<AwarenessState> = {}): AwarenessState {
  return {
    peerId,
    ...overrides,
  };
}

function cloneTestValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return value;
}

function createStateMeta(overrides: Partial<StateChangeMeta> = {}): StateChangeMeta {
  return {
    changedBy: 'peer-state',
    reason: 'set',
    timestamp: 1,
    pending: false,
    queuedMutationCount: 0,
    ...overrides,
  };
}

function createMockPresenceEngine(
  selfPeerId: string,
  peers: Peer<PresenceData>[],
): TestPresenceEngine {
  const subscribers = new Set<PresenceSubscriber>();
  let currentPeers = peers;

  const emit = (nextPeers: Peer<PresenceData>[]): void => {
    currentPeers = nextPeers;
    for (const subscriber of subscribers) {
      subscriber(currentPeers);
    }
  };

  const engine = {
    replace: vi.fn((data: Partial<PresenceData>) => {
      currentPeers = currentPeers.map((peer) => {
        if (peer.id !== selfPeerId) {
          return peer;
        }

        return {
          id: peer.id,
          joinedAt: peer.joinedAt,
          lastSeen: peer.lastSeen,
          ...data,
        };
      });
    }),
    subscribe: vi.fn((callback: PresenceSubscriber) => {
      subscribers.add(callback);
      callback(currentPeers);

      return () => {
        subscribers.delete(callback);
      };
    }),
    update: vi.fn((data: Partial<PresenceData>) => {
      currentPeers = currentPeers.map((peer) => {
        if (peer.id !== selfPeerId) {
          return peer;
        }

        return {
          ...peer,
          ...data,
        };
      });
    }),
    emit,
    get(peerId: string) {
      return (
        currentPeers.find((peer) => {
          return peer.id === peerId;
        }) ?? null
      );
    },
    getAll() {
      return currentPeers;
    },
    getSelf() {
      return (
        currentPeers.find((peer) => {
          return peer.id === selfPeerId;
        }) ?? currentPeers[0]
      );
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestPresenceEngine;

  return engine;
}

function createMockAwarenessEngine(peers: AwarenessState[] = []): TestAwarenessEngine {
  const subscribers = new Set<AwarenessSubscriber>();
  let currentPeers = peers;
  const selfPeerId = currentPeers[0]?.peerId ?? 'awareness-self';

  const emit = (nextPeers: AwarenessState[]): void => {
    currentPeers = nextPeers;
    for (const subscriber of subscribers) {
      subscriber(currentPeers);
    }
  };

  const updateSelf = (patch: Record<string, unknown>): void => {
    let foundSelf = false;
    currentPeers = currentPeers.map((entry) => {
      if (entry.peerId !== selfPeerId) {
        return entry;
      }

      foundSelf = true;
      return {
        ...entry,
        ...patch,
        peerId: selfPeerId,
      };
    });

    if (!foundSelf) {
      currentPeers = [{ peerId: selfPeerId, ...patch }, ...currentPeers];
    }
  };

  const engine = {
    emit,
    set: vi.fn((value: Record<string, unknown>) => {
      updateSelf(value);
    }),
    setFocus: vi.fn((elementId: string | null) => {
      updateSelf({ focus: elementId });
    }),
    setSelection: vi.fn((selection: AwarenessState['selection'] | null) => {
      updateSelf({ selection });
    }),
    setTyping: vi.fn((isTyping: boolean) => {
      updateSelf({ typing: isTyping });
    }),
    subscribe: vi.fn((callback: AwarenessSubscriber) => {
      subscribers.add(callback);
      callback(currentPeers);

      return () => {
        subscribers.delete(callback);
      };
    }),
    getAll() {
      return currentPeers;
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestAwarenessEngine;

  return engine;
}

function createMockCursorEngine(positions: CursorPosition<CursorData>[] = []): TestCursorEngine {
  const subscribers = new Set<CursorSubscriber>();
  let currentPositions = positions;

  const engine = {
    emit(nextPositions: CursorPosition<CursorData>[]) {
      currentPositions = nextPositions;
      for (const subscriber of subscribers) {
        subscriber(currentPositions);
      }
    },
    getPositions: vi.fn(() => {
      return currentPositions;
    }),
    mount: vi.fn(),
    render: vi.fn(),
    setPosition: vi.fn(),
    subscribe: vi.fn((callback: CursorSubscriber) => {
      subscribers.add(callback);
      callback(currentPositions);

      return () => {
        subscribers.delete(callback);
      };
    }),
    subscriberCount() {
      return subscribers.size;
    },
    unmount: vi.fn(),
  } as TestCursorEngine;

  return engine;
}

function createViewport(peerId: string, overrides: Partial<ViewportState> = {}): ViewportState {
  return {
    peerId,
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    viewportWidth: 200,
    viewportHeight: 200,
    focusedElement: null,
    ...overrides,
  };
}

function createMockViewportEngine(states: ViewportState[] = []): TestViewportEngine {
  const subscribers = new Set<ViewportSubscriber>();
  let currentStates = states;

  const engine = {
    broadcast: vi.fn(),
    emit(nextStates: ViewportState[]) {
      currentStates = nextStates;
      for (const subscriber of subscribers) {
        subscriber(currentStates);
      }
    },
    follow: vi.fn(),
    get(peerId: string) {
      return currentStates.find((state) => {
        return state.peerId === peerId;
      });
    },
    getAll() {
      return currentStates;
    },
    mount: vi.fn(),
    present: vi.fn(),
    stopBroadcast: vi.fn(),
    stopPresenting: vi.fn(),
    subscribe: vi.fn((callback: ViewportSubscriber) => {
      subscribers.add(callback);
      callback(currentStates);

      return () => {
        subscribers.delete(callback);
      };
    }),
    subscriberCount() {
      return subscribers.size;
    },
    unfollow: vi.fn(),
    unmount: vi.fn(),
  } as TestViewportEngine;

  return engine;
}

function createBeam(peerId: string, overrides: Partial<PointerBeam> = {}): PointerBeam {
  return {
    peerId,
    name: peerId,
    color: '#22c55e',
    x: 0.25,
    y: 0.75,
    active: true,
    ...overrides,
  };
}

function createMockPointerEngine(beams: PointerBeam[] = []): TestPointerEngine {
  const subscribers = new Set<PointerSubscriber>();
  let currentBeams = beams;

  const engine = {
    activate: vi.fn(),
    deactivate: vi.fn(),
    emit(nextBeams: PointerBeam[]) {
      currentBeams = nextBeams;
      for (const subscriber of subscribers) {
        subscriber(currentBeams);
      }
    },
    getAll() {
      return currentBeams;
    },
    mount: vi.fn(),
    render: vi.fn(() => {
      return () => undefined;
    }),
    subscribe: vi.fn((callback: PointerSubscriber) => {
      subscribers.add(callback);
      callback(currentBeams);

      return () => {
        subscribers.delete(callback);
      };
    }),
    subscriberCount() {
      return subscribers.size;
    },
    unmount: vi.fn(),
  } as TestPointerEngine;

  return engine;
}

function createLock(key: string, holder: Peer<PresenceData> | null = null): LockState {
  return {
    acquiredAt: holder ? 1 : 0,
    expiresAt: null,
    holder,
    key,
  };
}

function createMockLockEngine(): TestLockEngine {
  const keySubscribers = new Map<string, Set<LockStateSubscriber>>();
  const allSubscribers = new Set<LocksSubscriber>();
  const holders = new Map<string, LockState>();

  const collectAll = (): LockState[] => {
    return Array.from(holders.values()).filter((state) => {
      return state.holder !== null;
    });
  };

  const stateFor = (key: string): LockState => {
    return holders.get(key) ?? createLock(key, null);
  };

  const engine = {
    acquire: vi.fn(async () => {
      return true;
    }),
    allSubscriberCount() {
      return allSubscribers.size;
    },
    emitAll(states: LockState[]) {
      holders.clear();
      for (const state of states) {
        holders.set(state.key, state);
      }

      for (const subscriber of allSubscribers) {
        subscriber(states);
      }
    },
    emitKey(key: string, state: LockState) {
      holders.set(key, state);
      for (const subscriber of keySubscribers.get(key) ?? []) {
        subscriber(state);
      }
    },
    getAll() {
      return collectAll();
    },
    getHolder(key: string) {
      return stateFor(key).holder;
    },
    isLocked(key: string) {
      return stateFor(key).holder !== null;
    },
    keySubscriberCount(key: string) {
      return keySubscribers.get(key)?.size ?? 0;
    },
    release: vi.fn(),
    releaseAll: vi.fn(),
    setHolder(key: string, holder: Peer<PresenceData> | null) {
      holders.set(key, createLock(key, holder));
    },
    subscribe: vi.fn((key: string, callback: LockStateSubscriber) => {
      const subscribers = keySubscribers.get(key) ?? new Set<LockStateSubscriber>();
      subscribers.add(callback);
      keySubscribers.set(key, subscribers);
      callback(stateFor(key));

      return () => {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          keySubscribers.delete(key);
        }
      };
    }),
    subscribeAll: vi.fn((callback: LocksSubscriber) => {
      allSubscribers.add(callback);
      callback(collectAll());

      return () => {
        allSubscribers.delete(callback);
      };
    }),
  } as TestLockEngine;

  return engine;
}

function createMockEventEngine(): TestEventEngine {
  const subscribers = new Map<string, Set<EventSubscriber>>();

  const engine = {
    deliver(name: string, payload: unknown, from = createPeer('event-source')) {
      for (const subscriber of subscribers.get(name) ?? []) {
        subscriber(payload, from);
      }
    },
    emit: vi.fn(),
    emitTo: vi.fn(),
    on: vi.fn((name: string, callback: EventSubscriber) => {
      const handlers = subscribers.get(name) ?? new Set<EventSubscriber>();
      handlers.add(callback);
      subscribers.set(name, handlers);

      return () => {
        handlers.delete(callback);
        if (handlers.size === 0) {
          subscribers.delete(name);
        }
      };
    }),
    off: vi.fn(),
    subscriberCount(name: string) {
      return subscribers.get(name)?.size ?? 0;
    },
  } as TestEventEngine;

  return engine;
}

function createMockStateEngine<T>(initialValue: T): TestStateEngine<T> {
  const subscribers = new Set<StateSubscriber<T>>();
  let currentValue = cloneTestValue(initialValue);

  const engine = {
    emit(nextValue: T, meta: StateChangeMeta = createStateMeta()) {
      currentValue = cloneTestValue(nextValue);
      for (const subscriber of subscribers) {
        subscriber(engine.get(), meta);
      }
    },
    get: vi.fn(() => {
      return cloneTestValue(currentValue);
    }),
    patch: vi.fn(),
    reset: vi.fn(),
    set: vi.fn((nextValue: T) => {
      currentValue = cloneTestValue(nextValue);
      for (const subscriber of subscribers) {
        subscriber(engine.get(), createStateMeta({ changedBy: 'local' }));
      }
    }),
    subscribe: vi.fn((callback: StateSubscriber<T>) => {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    }),
    subscriberCount() {
      return subscribers.size;
    },
    undo: vi.fn(),
  } as TestStateEngine<T>;

  return engine;
}

function createMockRoom(
  roomId = 'room-1',
  options: RoomOptions<PresenceData> = {},
  config: {
    awarenessEngine?: TestAwarenessEngine;
    cursorEngine?: TestCursorEngine;
    eventEngine?: TestEventEngine;
    lockEngine?: TestLockEngine;
    peerId?: string;
    pointerEngine?: TestPointerEngine;
    presenceEngine?: TestPresenceEngine;
    stateEngine?: TestStateEngine<unknown>;
    status?: RoomStatus;
    viewportEngine?: TestViewportEngine;
  } = {},
): TestRoom {
  const handlers = new Map<RoomEventName, Set<RoomEventHandler>>();
  const peerId = config.peerId ?? `${roomId}-peer`;
  const awarenessEngine =
    config.awarenessEngine ?? createMockAwarenessEngine([createAwareness(peerId)]);
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const eventEngine = config.eventEngine ?? createMockEventEngine();
  const lockEngine = config.lockEngine ?? createMockLockEngine();
  const stateEngine = config.stateEngine ?? createMockStateEngine({});
  const viewportEngine = config.viewportEngine ?? createMockViewportEngine();
  const pointerEngine = config.pointerEngine ?? createMockPointerEngine();
  const presenceEngine =
    config.presenceEngine ?? createMockPresenceEngine(peerId, [createPeer(peerId)]);
  let currentStatus = config.status ?? 'idle';

  const room = {
    awarenessEngine,
    connect: vi.fn(async () => {
      currentStatus = 'connected';
    }),
    cursorEngine,
    disconnect: vi.fn(async () => {
      currentStatus = 'disconnected';
    }),
    emit<TEvent extends RoomEventName>(event: TEvent, payload: RoomEventMap<PresenceData>[TEvent]) {
      switch (event) {
        case 'connected':
          currentStatus = 'connected';
          break;
        case 'disconnected':
          currentStatus = 'disconnected';
          break;
        case 'error':
          currentStatus = 'error';
          break;
        case 'reconnecting':
          currentStatus = 'reconnecting';
          break;
        default:
          break;
      }

      for (const handler of handlers.get(event) ?? []) {
        handler(payload);
      }
    },
    eventEngine,
    get peerCount() {
      return room.peers.length;
    },
    get peers() {
      return presenceEngine.getAll().filter((peer) => {
        return peer.id !== peerId;
      });
    },
    get status() {
      return currentStatus;
    },
    getYDoc: vi.fn(),
    getYProvider: vi.fn(),
    id: roomId,
    listenerCount(event: RoomEventName) {
      return handlers.get(event)?.size ?? 0;
    },
    lockEngine,
    off: vi.fn((event: RoomEventName, handler: RoomEventHandler) => {
      handlers.get(event)?.delete(handler);
    }),
    on: vi.fn((event: RoomEventName, handler: RoomEventHandler) => {
      const eventHandlers = handlers.get(event) ?? new Set<RoomEventHandler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);

      return () => {
        eventHandlers.delete(handler);
      };
    }),
    peerId,
    pointerEngine,
    presenceEngine,
    setStatus(status: RoomStatus) {
      currentStatus = status;
    },
    stateEngine,
    useAwareness: vi.fn(() => {
      return awarenessEngine;
    }),
    useCursors: vi.fn(() => {
      return cursorEngine;
    }),
    useEvents: vi.fn(() => {
      return eventEngine;
    }),
    useLocks: vi.fn(() => {
      return lockEngine;
    }),
    usePointer: vi.fn(() => {
      return pointerEngine;
    }),
    usePresence: vi.fn(() => {
      return presenceEngine;
    }),
    useState: vi.fn(() => {
      return stateEngine;
    }),
    useViewport: vi.fn(() => {
      return viewportEngine;
    }),
    viewportEngine,
  } as TestRoom;

  createRoomMock.mockImplementationOnce(
    (nextRoomId: string, nextOptions: RoomOptions<PresenceData>) => {
      expect(nextRoomId).toBe(roomId);
      expect(nextOptions).toEqual(expect.objectContaining(options));
      return room;
    },
  );

  return room;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function runMountLifecycle(): Promise<void> {
  for (const callback of lifecycleState.mountCallbacks) {
    callback();
  }

  await flushMicrotasks();
}

async function runDestroyLifecycle(): Promise<void> {
  for (const callback of lifecycleState.destroyCallbacks) {
    callback();
  }

  await flushMicrotasks();
}

function resetLifecycleState(): void {
  lifecycleState.destroyCallbacks = [];
  lifecycleState.failRegistration = false;
  lifecycleState.mountCallbacks = [];
}

beforeEach(() => {
  createRoomMock.mockReset();
  document.body.innerHTML = '';
  resetLifecycleState();
});

describe('roomful', () => {
  it('creates the room immediately, defers connect until mount, and auto-cleans on destroy', async () => {
    const self = createPeer('svelte-self', { name: 'Ada' });
    const other = createPeer('svelte-other', { name: 'Grace' });
    const presenceEngine = createMockPresenceEngine('svelte-self', [self, other]);
    const cursorEngine = createMockCursorEngine([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    const awarenessEngine = createMockAwarenessEngine([
      createAwareness('svelte-self', {
        typing: true,
      }),
      createAwareness('svelte-other', {
        focus: 'editor-1',
      }),
    ]);
    const eventEngine = createMockEventEngine();
    const room = createMockRoom(
      'svelte-room',
      {
        transport: 'broadcast',
      },
      {
        awarenessEngine,
        cursorEngine,
        eventEngine,
        peerId: 'svelte-self',
        presenceEngine,
      },
    );

    const adapter = roomful('svelte-room', {
      transport: 'broadcast',
    });
    const snapshots: PresenceStoreValue<PresenceData>[] = [];
    const channelValues: Array<EventChannelValue<{ text: string }, PresenceData> | null> = [];
    const unsubscribePresence = adapter.presence.subscribe((value) => {
      snapshots.push(value);
    });
    const unsubscribeEvent = adapter.events.on<{ text: string }>('message', () => {
      return undefined;
    });
    const channel = adapter.events.channel<{ text: string }>('message');
    const unsubscribeChannel = channel.subscribe((value) => {
      channelValues.push(value);
    });

    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(get(adapter.presence).others).toEqual([other]);
    expect(get(adapter.cursors)).toEqual([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    expect(get(adapter.awareness)).toEqual({
      others: [
        createAwareness('svelte-other', {
          focus: 'editor-1',
        }),
      ],
    });
    expect(channelValues).toEqual([null]);
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(presenceEngine.subscribe).toHaveBeenCalledTimes(0);
    expect(cursorEngine.subscribe).toHaveBeenCalledTimes(0);
    expect(awarenessEngine.subscribe).toHaveBeenCalledTimes(0);
    expect(eventEngine.on).toHaveBeenCalledTimes(0);
    expect(lifecycleState.mountCallbacks).toHaveLength(1);
    expect(lifecycleState.destroyCallbacks).toHaveLength(1);

    await runDestroyLifecycle();
    expect(room.disconnect).toHaveBeenCalledTimes(0);

    await runMountLifecycle();
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(presenceEngine.subscribe).toHaveBeenCalledTimes(1);
    expect(cursorEngine.subscribe).toHaveBeenCalledTimes(1);
    expect(awarenessEngine.subscribe).toHaveBeenCalledTimes(1);
    expect(eventEngine.on).toHaveBeenCalledTimes(2);
    expect(eventEngine.subscriberCount('message')).toBe(2);
    expect(snapshots).toHaveLength(1);

    await runDestroyLifecycle();
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(presenceEngine.subscriberCount()).toBe(0);
    expect(cursorEngine.subscriberCount()).toBe(0);
    expect(awarenessEngine.subscriberCount()).toBe(0);
    expect(eventEngine.subscriberCount('message')).toBe(0);

    unsubscribeChannel();
    unsubscribeEvent();
    unsubscribePresence();
  });

  it('supports manual connect and destroy when lifecycle hooks are unavailable', async () => {
    lifecycleState.failRegistration = true;

    const eventEngine = createMockEventEngine();
    const room = createMockRoom(
      'manual-room',
      {
        transport: 'broadcast',
      },
      {
        eventEngine,
      },
    );

    const adapter = roomful('manual-room', {
      transport: 'broadcast',
    });
    const onMessage = vi.fn();

    adapter.events.on<{ text: string }>('message', onMessage);

    expect(lifecycleState.mountCallbacks).toHaveLength(0);
    expect(lifecycleState.destroyCallbacks).toHaveLength(0);
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(eventEngine.on).toHaveBeenCalledTimes(0);

    await adapter.connect();
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(eventEngine.on).toHaveBeenCalledTimes(1);

    eventEngine.deliver('message', {
      text: 'manual',
    });
    expect(onMessage).toHaveBeenCalledWith(
      {
        text: 'manual',
      },
      expect.objectContaining({
        id: 'event-source',
      }),
    );

    await adapter.destroy();
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(eventEngine.subscriberCount('message')).toBe(0);

    await expect(adapter.connect()).rejects.toThrow('Cannot call connect() after destroy().');
  });

  it('exposes presence as a store, updates local self, and skips lastSeen-only churn', async () => {
    const self = createPeer('presence-self', { name: 'Ada' });
    const other = createPeer('presence-other', {
      metadata: {
        role: 'editor',
      },
      name: 'Grace',
    });
    const presenceEngine = createMockPresenceEngine('presence-self', [self, other]);
    createMockRoom(
      'presence-room',
      {},
      {
        peerId: 'presence-self',
        presenceEngine,
      },
    );

    const adapter = roomful('presence-room');
    const snapshots: PresenceStoreValue<PresenceData>[] = [];
    const unsubscribe = adapter.presence.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.presence).others).toEqual([other]);

    adapter.presence.set({
      status: 'online',
    });
    expect(presenceEngine.replace).toHaveBeenCalledWith({
      status: 'online',
    });
    expect(get(adapter.presence).self).toMatchObject({
      status: 'online',
    });

    adapter.presence.update((current) => {
      return {
        ...current,
        mood: 'focused',
      };
    });
    expect(presenceEngine.replace).toHaveBeenLastCalledWith({
      mood: 'focused',
      status: 'online',
    });

    await adapter.connect();
    const snapshotCountAfterConnect = snapshots.length;

    presenceEngine.emit([
      {
        id: 'presence-self',
        joinedAt: 1,
        lastSeen: 2,
        mood: 'focused',
        status: 'online',
      },
      createPeer('presence-other', {
        lastSeen: 99,
        metadata: {
          role: 'editor',
        },
        name: 'Grace',
      }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountAfterConnect);

    presenceEngine.emit([
      {
        id: 'presence-self',
        joinedAt: 1,
        lastSeen: 1,
        mood: 'focused',
        status: 'online',
      },
      createPeer('presence-other', {
        metadata: {
          role: 'reviewer',
        },
        name: 'Grace',
      }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountAfterConnect + 1);
    expect(snapshots[snapshotCountAfterConnect]?.others[0]).toMatchObject({
      metadata: {
        role: 'reviewer',
      },
    });

    unsubscribe();
  });

  it('exposes awareness as a store, forwards helper methods, and only reacts to remote changes', async () => {
    const awarenessEngine = createMockAwarenessEngine([
      createAwareness('awareness-self', {
        typing: true,
      }),
      createAwareness('awareness-other', {
        focus: 'editor-1',
      }),
    ]);
    createMockRoom(
      'awareness-room',
      {},
      {
        awarenessEngine,
        peerId: 'awareness-self',
      },
    );

    const adapter = roomful('awareness-room');
    const snapshots: AwarenessStoreValue[] = [];
    const unsubscribe = adapter.awareness.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.awareness)).toEqual({
      others: [
        createAwareness('awareness-other', {
          focus: 'editor-1',
        }),
      ],
    });

    adapter.awareness.set({
      mode: 'draft',
    });
    adapter.awareness.setFocus('comment-1');
    adapter.awareness.setSelection({
      elementId: 'comment-1',
      from: 1,
      to: 3,
    });
    adapter.awareness.setTyping(false);

    expect(awarenessEngine.set).toHaveBeenCalledWith({
      mode: 'draft',
    });
    expect(awarenessEngine.setFocus).toHaveBeenCalledWith('comment-1');
    expect(awarenessEngine.setSelection).toHaveBeenCalledWith({
      elementId: 'comment-1',
      from: 1,
      to: 3,
    });
    expect(awarenessEngine.setTyping).toHaveBeenCalledWith(false);

    await adapter.connect();

    awarenessEngine.emit([
      createAwareness('awareness-self', {
        mode: 'review',
      }),
      createAwareness('awareness-other', {
        focus: 'editor-1',
      }),
    ]);
    expect(snapshots).toHaveLength(1);

    awarenessEngine.emit([
      createAwareness('awareness-self', {
        mode: 'review',
      }),
      createAwareness('awareness-other', {
        focus: 'editor-2',
      }),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toEqual({
      others: [
        createAwareness('awareness-other', {
          focus: 'editor-2',
        }),
      ],
    });

    unsubscribe();
  });

  it('mounts cursor actions on elements, supports rebinding, and skips deep-equal remote updates', async () => {
    const cursorEngine = createMockCursorEngine([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    createMockRoom(
      'cursor-room',
      {},
      {
        cursorEngine,
      },
    );

    const adapter = roomful('cursor-room');
    const snapshots: Array<CursorPosition<CursorData>[]> = [];
    const unsubscribe = adapter.cursors.subscribe((value) => {
      snapshots.push(value);
    });
    const boardA = document.createElement('div');
    const boardB = document.createElement('div');

    const cleanupA = adapter.cursors.mount(boardA);
    expect(cursorEngine.mount).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(boardA);

    const cleanupB = adapter.cursors.mount(boardB);
    expect(cursorEngine.unmount).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenCalledTimes(2);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(boardB);

    cleanupA.destroy?.();
    expect(cursorEngine.unmount).toHaveBeenCalledTimes(1);

    cleanupB.destroy?.();
    expect(cursorEngine.unmount).toHaveBeenCalledTimes(2);

    adapter.cursors.set({
      x: 0.5,
      y: 0.25,
    });
    adapter.cursors.update((current) => {
      return {
        ...current,
        tool: 'eraser',
      };
    });
    expect(cursorEngine.setPosition).toHaveBeenNthCalledWith(1, {
      x: 0.5,
      y: 0.25,
    });
    expect(cursorEngine.setPosition).toHaveBeenNthCalledWith(2, {
      tool: 'eraser',
      x: 0.5,
      y: 0.25,
    });

    await adapter.connect();

    cursorEngine.emit([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    expect(snapshots).toHaveLength(1);

    cursorEngine.emit([
      createCursor('cursor-peer', {
        tool: 'eraser',
        x: 0.8,
        xAbsolute: 80,
      }),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({
      tool: 'eraser',
      x: 0.8,
      xAbsolute: 80,
    });

    unsubscribe();
  });

  it('exposes viewport as a store, mounts actions, forwards controls, and skips deep-equal updates', async () => {
    const viewportEngine = createMockViewportEngine([
      createViewport('viewport-peer', {
        scrollY: 0.5,
      }),
    ]);
    createMockRoom(
      'viewport-room',
      {},
      {
        viewportEngine,
      },
    );

    const adapter = roomful('viewport-room');
    const snapshots: Array<ViewportState[]> = [];
    const unsubscribe = adapter.viewport.subscribe((value) => {
      snapshots.push(value);
    });
    const boardA = document.createElement('div');
    const boardB = document.createElement('div');

    expect(get(adapter.viewport)).toEqual([
      createViewport('viewport-peer', {
        scrollY: 0.5,
      }),
    ]);

    const cleanupA = adapter.viewport.mount(boardA);
    expect(viewportEngine.mount).toHaveBeenCalledTimes(1);
    expect(viewportEngine.mount).toHaveBeenLastCalledWith(boardA);

    const cleanupB = adapter.viewport.mount(boardB);
    expect(viewportEngine.unmount).toHaveBeenCalledTimes(1);
    expect(viewportEngine.mount).toHaveBeenCalledTimes(2);
    expect(viewportEngine.mount).toHaveBeenLastCalledWith(boardB);

    cleanupA.destroy?.();
    expect(viewportEngine.unmount).toHaveBeenCalledTimes(1);

    cleanupB.destroy?.();
    expect(viewportEngine.unmount).toHaveBeenCalledTimes(2);

    adapter.viewport.broadcast();
    adapter.viewport.stopBroadcast();
    adapter.viewport.present();
    adapter.viewport.stopPresenting();
    adapter.viewport.follow('viewport-peer');
    adapter.viewport.unfollow();

    expect(viewportEngine.broadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopBroadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.present).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopPresenting).toHaveBeenCalledTimes(1);
    expect(viewportEngine.follow).toHaveBeenCalledWith('viewport-peer');
    expect(viewportEngine.unfollow).toHaveBeenCalledTimes(1);

    await adapter.connect();

    viewportEngine.emit([
      createViewport('viewport-peer', {
        scrollY: 0.5,
      }),
    ]);
    expect(snapshots).toHaveLength(1);

    viewportEngine.emit([
      createViewport('viewport-peer', {
        scrollY: 0.9,
      }),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({
      scrollY: 0.9,
    });

    unsubscribe();
  });

  it('exposes pointer as a store, mounts actions, forwards controls, and skips deep-equal updates', async () => {
    const pointerEngine = createMockPointerEngine([
      createBeam('pointer-peer', {
        x: 0.4,
        y: 0.6,
      }),
    ]);
    createMockRoom(
      'pointer-room',
      {},
      {
        pointerEngine,
      },
    );

    const adapter = roomful('pointer-room');
    const snapshots: Array<PointerBeam[]> = [];
    const unsubscribe = adapter.pointer.subscribe((value) => {
      snapshots.push(value);
    });
    const boardA = document.createElement('div');
    const boardB = document.createElement('div');

    expect(get(adapter.pointer)).toEqual([
      createBeam('pointer-peer', {
        x: 0.4,
        y: 0.6,
      }),
    ]);

    const cleanupA = adapter.pointer.mount(boardA);
    expect(pointerEngine.mount).toHaveBeenCalledTimes(1);
    expect(pointerEngine.mount).toHaveBeenLastCalledWith(boardA);

    const cleanupB = adapter.pointer.mount(boardB);
    expect(pointerEngine.unmount).toHaveBeenCalledTimes(1);
    expect(pointerEngine.mount).toHaveBeenCalledTimes(2);
    expect(pointerEngine.mount).toHaveBeenLastCalledWith(boardB);

    cleanupA.destroy?.();
    expect(pointerEngine.unmount).toHaveBeenCalledTimes(1);

    cleanupB.destroy?.();
    expect(pointerEngine.unmount).toHaveBeenCalledTimes(2);

    adapter.pointer.activate();
    adapter.pointer.deactivate();
    const cleanup = adapter.pointer.render({ style: 'laser' });

    expect(pointerEngine.activate).toHaveBeenCalledTimes(1);
    expect(pointerEngine.deactivate).toHaveBeenCalledTimes(1);
    expect(pointerEngine.render).toHaveBeenCalledWith({ style: 'laser' });
    expect(typeof cleanup).toBe('function');

    await adapter.connect();

    pointerEngine.emit([
      createBeam('pointer-peer', {
        x: 0.4,
        y: 0.6,
      }),
    ]);
    expect(snapshots).toHaveLength(1);

    pointerEngine.emit([
      createBeam('pointer-peer', {
        x: 0.9,
      }),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({
      x: 0.9,
    });

    unsubscribe();
  });

  it('exposes locks as a store, reflects remote claims, and forwards controls', async () => {
    const lockEngine = createMockLockEngine();
    lockEngine.setHolder('cell-1', createPeer('owner-peer'));
    createMockRoom(
      'locks-room',
      {},
      {
        lockEngine,
      },
    );

    const adapter = roomful('locks-room');
    const snapshots: Array<LockState[]> = [];
    const unsubscribe = adapter.locks.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.locks)).toEqual([expect.objectContaining({ key: 'cell-1' })]);
    expect(adapter.locks.isLocked('cell-1')).toBe(true);
    expect(adapter.locks.getHolder('cell-1')?.id).toBe('owner-peer');

    await adapter.locks.acquire('cell-2', { ttl: 1_000 });
    adapter.locks.release('cell-1');
    adapter.locks.releaseAll();

    expect(lockEngine.acquire).toHaveBeenCalledWith('cell-2', { ttl: 1_000 });
    expect(lockEngine.release).toHaveBeenCalledWith('cell-1');
    expect(lockEngine.releaseAll).toHaveBeenCalledTimes(1);

    await adapter.connect();

    // A remote claim on a new key is reflected in the store; a deep-equal re-emit is skipped.
    lockEngine.emitAll([
      createLock('cell-1', createPeer('owner-peer')),
      createLock('cell-3', createPeer('peer-c')),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.map((state) => state.key)).toEqual(['cell-1', 'cell-3']);
    expect(adapter.locks.getHolder('cell-3')?.id).toBe('peer-c');

    lockEngine.emitAll([
      createLock('cell-1', createPeer('owner-peer')),
      createLock('cell-3', createPeer('peer-c')),
    ]);
    expect(snapshots).toHaveLength(2);

    unsubscribe();
  });

  it('creates per-key lockState stores that track free to held to free transitions', async () => {
    const lockEngine = createMockLockEngine();
    createMockRoom(
      'lock-state-room',
      {},
      {
        lockEngine,
      },
    );

    const adapter = roomful('lock-state-room');
    const store = adapter.lockState('cell-1');
    const sameStore = adapter.lockState('cell-1');
    const observed: Array<LockState | null> = [];
    const unsubscribe = store.subscribe((value) => {
      observed.push(value);
    });

    // Initially free.
    expect(get(store)).toBeNull();
    expect(observed.at(-1)).toBeNull();

    await adapter.connect();

    lockEngine.emitKey('cell-1', createLock('cell-1', createPeer('owner-peer')));
    expect(observed.at(-1)).toMatchObject({ key: 'cell-1', holder: { id: 'owner-peer' } });

    lockEngine.emitKey('cell-1', createLock('cell-1', null));
    expect(observed.at(-1)).toBeNull();

    // A second store for the same key reuses the same subscription.
    expect(lockEngine.keySubscriberCount('cell-1')).toBe(1);
    expect(get(sameStore)).toBeNull();

    unsubscribe();

    await adapter.destroy();
    expect(lockEngine.keySubscriberCount('cell-1')).toBe(0);
  });

  it('creates shared state stores, keeps setter identity stable, and enforces binding rules', async () => {
    const stateEngine = createMockStateEngine({
      count: 0,
    });
    const room = createMockRoom(
      'state-room',
      {},
      {
        stateEngine,
      },
    );

    const adapter = roomful('state-room');
    const [countStore, setCount] = adapter.state.shared('counter', {
      initialValue: {
        count: 0,
      },
    });
    const [sameStore, sameSetter] = adapter.state.shared('counter', {
      initialValue: {
        count: 0,
      },
    });
    const values: Array<{ count: number }> = [];
    const unsubscribe = countStore.subscribe((value) => {
      values.push(value);
    });

    expect(countStore).toBe(sameStore);
    expect(setCount).toBe(sameSetter);
    expect(get(countStore)).toEqual({
      count: 0,
    });
    expect(stateEngine.subscribe).toHaveBeenCalledTimes(0);

    countStore.set({
      count: 1,
    });
    countStore.update((current) => {
      return {
        count: current.count + 1,
      };
    });
    setCount((current) => {
      return {
        count: current.count + 1,
      };
    });

    expect(values).toEqual([{ count: 0 }, { count: 1 }, { count: 2 }, { count: 3 }]);
    expect(stateEngine.set).toHaveBeenNthCalledWith(1, {
      count: 1,
    });
    expect(stateEngine.set).toHaveBeenNthCalledWith(2, {
      count: 2,
    });
    expect(stateEngine.set).toHaveBeenNthCalledWith(3, {
      count: 3,
    });

    await adapter.connect();
    expect(stateEngine.subscribe).toHaveBeenCalledTimes(1);

    stateEngine.emit({
      count: 3,
    });
    expect(values).toHaveLength(4);

    stateEngine.emit({
      count: 4,
    });
    expect(values).toHaveLength(5);
    expect(values[4]).toEqual({
      count: 4,
    });

    adapter.state.shared('counter', {
      initialValue: {
        count: 0,
      },
      persist: true,
    });
    expect(room.useState.mock.calls).toHaveLength(2);

    expect(() => {
      adapter.state.shared('different-key', {
        initialValue: {
          count: 0,
        },
      });
    }).toThrow('already bound to key');
    expect(() => {
      adapter.state.shared('counter', {
        initialValue: {
          count: 1,
        },
      });
    }).toThrow('different initialValue');

    unsubscribe();
  });

  it('registers event listeners lazily, exposes per-event channels, and cleans them up on destroy', async () => {
    const eventEngine = createMockEventEngine();
    createMockRoom(
      'event-room',
      {},
      {
        eventEngine,
      },
    );

    const adapter = roomful('event-room');
    const onMessage = vi.fn();
    const unsubscribe = adapter.events.on<{ text: string }>('message', onMessage);
    const channel = adapter.events.channel<{ text: string }>('message');
    const values: Array<EventChannelValue<{ text: string }, PresenceData> | null> = [];
    const unsubscribeChannel = channel.subscribe((value) => {
      values.push(value);
    });

    expect(values).toEqual([null]);
    expect(eventEngine.on).toHaveBeenCalledTimes(0);

    await adapter.connect();
    expect(eventEngine.on).toHaveBeenCalledTimes(2);
    expect(eventEngine.subscriberCount('message')).toBe(2);

    eventEngine.deliver(
      'message',
      {
        text: 'hello',
      },
      createPeer('sender-a', {
        name: 'Sender A',
      }),
    );

    expect(onMessage).toHaveBeenCalledWith(
      {
        text: 'hello',
      },
      expect.objectContaining({
        id: 'sender-a',
        name: 'Sender A',
      }),
    );
    expect(values[1]).toEqual({
      from: createPeer('sender-a', {
        name: 'Sender A',
      }),
      payload: {
        text: 'hello',
      },
    });

    channel.emit({
      text: 'outbound',
    });
    channel.emitTo('peer-b', {
      text: 'direct',
    });

    expect(eventEngine.emit).toHaveBeenCalledWith('message', {
      text: 'outbound',
    });
    expect(eventEngine.emitTo).toHaveBeenCalledWith('peer-b', 'message', {
      text: 'direct',
    });

    unsubscribe();
    expect(eventEngine.subscriberCount('message')).toBe(1);

    unsubscribeChannel();
    await adapter.destroy();
    expect(eventEngine.subscriberCount('message')).toBe(0);
  });

  it('preserves the intended public types', () => {
    createMockRoom('typed-room', {}, { peerId: 'typed-self' });

    const adapter = roomful<{ role: 'editor' | 'viewer' }, { tool: 'pen' | 'eraser' }>(
      'typed-room',
    );
    const [votes, setVotes] = adapter.state.shared('votes', {
      initialValue: {
        no: 0,
        yes: 0,
      },
    });
    const reaction = adapter.events.channel<{ emoji: string }>('reaction');

    expectTypeOf(get(adapter.presence).others[0]?.role).toEqualTypeOf<
      'editor' | 'viewer' | undefined
    >();
    expectTypeOf(get(adapter.cursors)[0]?.tool).toEqualTypeOf<'pen' | 'eraser' | undefined>();
    expectTypeOf(votes).toMatchTypeOf<Writable<{ no: number; yes: number }>>();
    expectTypeOf(setVotes).toEqualTypeOf<
      (
        nextValue:
          | { no: number; yes: number }
          | ((current: { no: number; yes: number }) => { no: number; yes: number }),
      ) => void
    >();
    expectTypeOf(get(reaction)?.payload.emoji).toEqualTypeOf<string | undefined>();
    expectTypeOf(adapter.cursors.mount).toEqualTypeOf<Action<HTMLElement, undefined>>();
  });

  it('throws typed errors for destroyed adapters', async () => {
    createMockRoom('destroyed-room');
    const adapter = roomful('destroyed-room');

    await adapter.destroy();

    expect(() => {
      adapter.events.emit('message', {
        text: 'boom',
      });
    }).toThrowError(RoomfulError);
    expect(() => {
      adapter.presence.set({
        status: 'away',
      });
    }).toThrow('destroy()');
  });

  it('exposes a status store that tracks room lifecycle transitions', async () => {
    const room = createMockRoom('status-room');
    const adapter = roomful('status-room');
    const statuses: RoomStatus[] = [];
    const unsubscribe = adapter.status.subscribe((value) => {
      statuses.push(value);
    });

    room.emit('connected', undefined);
    room.emit('reconnecting', { attempt: 1 });
    room.emit('disconnected', { reason: 'manual' });
    room.emit('error', new RoomfulError('NETWORK_ERROR', 'boom', true));

    expect(statuses).toEqual(['idle', 'connected', 'reconnecting', 'disconnected', 'error']);

    unsubscribe();
    await adapter.destroy();
  });

  it('forwards connected, disconnected, and error events to lifecycle callbacks and cleans up', async () => {
    const room = createMockRoom('lifecycle-room');
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const onError = vi.fn();
    const adapter = roomful('lifecycle-room', {
      onConnect,
      onDisconnect,
      onError,
    });

    const error = new RoomfulError('NETWORK_ERROR', 'boom', true);
    room.emit('connected', undefined);
    room.emit('disconnected', { reason: 'manual' });
    room.emit('error', error);

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith({ reason: 'manual' });
    expect(onError).toHaveBeenCalledWith(error);

    await adapter.destroy();

    expect(room.listenerCount('connected')).toBe(0);
    expect(room.listenerCount('disconnected')).toBe(0);
    expect(room.listenerCount('error')).toBe(0);
  });
});
