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
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, watchEffect } from 'vue';

import type {
  UseAwarenessResult,
  UseCursorsResult,
  UseLocksResult,
  UsePresenceResult,
  UseViewportResult,
} from './index';
import {
  RoomfulPlugin,
  useAwareness,
  useConnectionStatus,
  useCursors,
  useEvent,
  useLocks,
  useLockState,
  usePresence,
  useSharedState,
  useViewport,
} from './index';

const { createRoomMock } = vi.hoisted(() => {
  return {
    createRoomMock: vi.fn(),
  };
});

vi.mock('@roomful/core', async () => {
  const actual = await vi.importActual<typeof import('@roomful/core')>('@roomful/core');

  return {
    ...actual,
    createRoom: createRoomMock,
  };
});

type RoomEventPayload = RoomEventMap<PresenceData>[RoomEventName];
type RoomEventHandler = (payload: RoomEventPayload) => void;
type AwarenessSubscriber = (peers: AwarenessState[]) => void;
type CursorSubscriber = (positions: CursorPosition<CursorData>[]) => void;
type EventSubscriber = (payload: unknown, from: Peer<PresenceData>) => void;
type PresenceSubscriber = (peers: Peer<PresenceData>[]) => void;
type StateSubscriber<T> = (value: T, meta: StateChangeMeta) => void;
type ViewportSubscriber = (states: ViewportState[]) => void;
type LockStateSubscriber = (state: LockState) => void;
type LocksSubscriber = (states: LockState[]) => void;

type TestPresenceEngine = PresenceEngine<PresenceData> & {
  emit(peers: Peer<PresenceData>[]): void;
  subscriberCount(): number;
  update: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
  replace: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
};

type TestCursorEngine = CursorEngine<CursorData> & {
  emit(positions: CursorPosition<CursorData>[]): void;
  subscriberCount(): number;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
};

type TestViewportEngine = ViewportEngine & {
  emit(states: ViewportState[]): void;
  subscriberCount(): number;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
  broadcast: ReturnType<typeof vi.fn<() => void>>;
  stopBroadcast: ReturnType<typeof vi.fn<() => void>>;
  present: ReturnType<typeof vi.fn<() => void>>;
  stopPresenting: ReturnType<typeof vi.fn<() => void>>;
  follow: ReturnType<typeof vi.fn<(peerId: string) => void>>;
  unfollow: ReturnType<typeof vi.fn<() => void>>;
};

type TestLockEngine = LockEngine & {
  emitKey(key: string, state: LockState): void;
  emitAll(states: LockState[]): void;
  setHolder(key: string, holder: Peer<PresenceData> | null): void;
  keySubscriberCount(key: string): number;
  allSubscriberCount(): number;
  acquire: ReturnType<typeof vi.fn<(key: string) => Promise<boolean>>>;
  release: ReturnType<typeof vi.fn<(key: string) => void>>;
  releaseAll: ReturnType<typeof vi.fn<() => void>>;
};

type TestAwarenessEngine = AwarenessEngine & {
  emit(peers: AwarenessState[]): void;
  subscriberCount(): number;
  set: ReturnType<typeof vi.fn<(value: Record<string, unknown>) => void>>;
  setFocus: ReturnType<typeof vi.fn<(elementId: string | null) => void>>;
  setSelection: ReturnType<typeof vi.fn<(selection: AwarenessState['selection'] | null) => void>>;
  setTyping: ReturnType<typeof vi.fn<(isTyping: boolean) => void>>;
};

type TestEventEngine = EventEngine<PresenceData> & {
  deliver(name: string, payload: unknown, from?: Peer<PresenceData>): void;
  subscriberCount(name: string): number;
  emit: ReturnType<typeof vi.fn<(name: string, payload: unknown) => void>>;
};

type TestStateEngine<T> = StateEngine<T> & {
  emit(value: T, meta?: StateChangeMeta): void;
  subscriberCount(): number;
  get: ReturnType<typeof vi.fn<() => T>>;
  set: ReturnType<typeof vi.fn<(value: T) => void>>;
};

type TestRoom = Room<PresenceData> & {
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  emit: <TEvent extends RoomEventName>(
    event: TEvent,
    payload: RoomEventMap<PresenceData>[TEvent],
  ) => void;
  listenerCount(event: RoomEventName): number;
  setStatus(status: RoomStatus): void;
  awarenessEngine: TestAwarenessEngine;
  cursorEngine: TestCursorEngine;
  eventEngine: TestEventEngine;
  lockEngine: TestLockEngine;
  presenceEngine: TestPresenceEngine;
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
    userId,
    name: userId,
    color: '#111111',
    x: 0.25,
    y: 0.75,
    xAbsolute: 25,
    yAbsolute: 75,
    idle: false,
    ...overrides,
  };
}

function createAwareness(peerId: string, overrides: Partial<AwarenessState> = {}): AwarenessState {
  return {
    peerId,
    ...overrides,
  };
}

function createMockPresenceEngine(
  selfPeerId: string,
  peers: Peer<PresenceData>[],
): TestPresenceEngine {
  const subscribers = new Set<PresenceSubscriber>();
  let currentPeers = peers;

  const engine = {
    update: vi.fn(),
    replace: vi.fn(),
    subscribe(callback: PresenceSubscriber) {
      subscribers.add(callback);
      callback(currentPeers);
      return () => {
        subscribers.delete(callback);
      };
    },
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
    emit(nextPeers: Peer<PresenceData>[]) {
      currentPeers = nextPeers;
      for (const subscriber of subscribers) {
        subscriber(currentPeers);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } satisfies TestPresenceEngine;

  return engine;
}

function createMockCursorEngine(positions: CursorPosition<CursorData>[] = []): TestCursorEngine {
  const subscribers = new Set<CursorSubscriber>();
  let currentPositions = positions;

  const engine = {
    mount: vi.fn(),
    unmount: vi.fn(),
    render: vi.fn(),
    setPosition: vi.fn(),
    subscribe(callback: CursorSubscriber) {
      subscribers.add(callback);
      callback(currentPositions);
      return () => {
        subscribers.delete(callback);
      };
    },
    getPositions() {
      return currentPositions;
    },
    emit(nextPositions: CursorPosition<CursorData>[]) {
      currentPositions = nextPositions;
      for (const subscriber of subscribers) {
        subscriber(currentPositions);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } satisfies TestCursorEngine;

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
    mount: vi.fn(),
    unmount: vi.fn(),
    broadcast: vi.fn(),
    stopBroadcast: vi.fn(),
    present: vi.fn(),
    stopPresenting: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
    getAll() {
      return currentStates;
    },
    get(peerId: string) {
      return currentStates.find((state) => {
        return state.peerId === peerId;
      });
    },
    subscribe(callback: ViewportSubscriber) {
      subscribers.add(callback);
      callback(currentStates);
      return () => {
        subscribers.delete(callback);
      };
    },
    emit(nextStates: ViewportState[]) {
      currentStates = nextStates;
      for (const subscriber of subscribers) {
        subscriber(currentStates);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } satisfies TestViewportEngine;

  return engine;
}

function createLock(key: string, holder: Peer<PresenceData> | null = null): LockState {
  return {
    key,
    holder,
    acquiredAt: holder ? 1 : 0,
    expiresAt: null,
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
    release: vi.fn(),
    releaseAll: vi.fn(),
    isLocked(key: string) {
      return stateFor(key).holder !== null;
    },
    getHolder(key: string) {
      return stateFor(key).holder;
    },
    getAll() {
      return collectAll();
    },
    subscribe(key: string, callback: LockStateSubscriber) {
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
    },
    subscribeAll(callback: LocksSubscriber) {
      allSubscribers.add(callback);
      callback(collectAll());

      return () => {
        allSubscribers.delete(callback);
      };
    },
    setHolder(key: string, holder: Peer<PresenceData> | null) {
      holders.set(key, createLock(key, holder));
    },
    emitKey(key: string, state: LockState) {
      holders.set(key, state);
      for (const subscriber of keySubscribers.get(key) ?? []) {
        subscriber(state);
      }
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
    keySubscriberCount(key: string) {
      return keySubscribers.get(key)?.size ?? 0;
    },
    allSubscriberCount() {
      return allSubscribers.size;
    },
  } as TestLockEngine;

  return engine;
}

function createMockAwarenessEngine(peers: AwarenessState[] = []): TestAwarenessEngine {
  const subscribers = new Set<AwarenessSubscriber>();
  let currentPeers = peers;

  const engine = {
    set: vi.fn(),
    setTyping: vi.fn(),
    setFocus: vi.fn(),
    setSelection: vi.fn(),
    subscribe(callback: AwarenessSubscriber) {
      subscribers.add(callback);
      callback(currentPeers);
      return () => {
        subscribers.delete(callback);
      };
    },
    getAll() {
      return currentPeers;
    },
    emit(nextPeers: AwarenessState[]) {
      currentPeers = nextPeers;
      for (const subscriber of subscribers) {
        subscriber(currentPeers);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } satisfies TestAwarenessEngine;

  return engine;
}

function createMockEventEngine(): TestEventEngine {
  const subscribers = new Map<string, Set<EventSubscriber>>();

  const engine = {
    emit: vi.fn(),
    emitTo: vi.fn(),
    on(name: string, callback: EventSubscriber) {
      const handlers = subscribers.get(name) ?? new Set<EventSubscriber>();
      handlers.add(callback);
      subscribers.set(name, handlers);
      return () => {
        handlers.delete(callback);
        if (handlers.size === 0) {
          subscribers.delete(name);
        }
      };
    },
    off(name: string, callback: EventSubscriber) {
      const handlers = subscribers.get(name);
      if (!handlers) {
        return;
      }

      handlers.delete(callback);
      if (handlers.size === 0) {
        subscribers.delete(name);
      }
    },
    deliver(name: string, payload: unknown, from = createPeer('event-source')) {
      for (const subscriber of subscribers.get(name) ?? []) {
        subscriber(payload, from);
      }
    },
    subscriberCount(name: string) {
      return subscribers.get(name)?.size ?? 0;
    },
  } satisfies TestEventEngine;

  return engine;
}

function cloneTestValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return value;
}

function createStateMeta(overrides: Partial<StateChangeMeta> = {}): StateChangeMeta {
  return {
    reason: 'set',
    changedBy: 'peer-state',
    timestamp: 1,
    pending: false,
    queuedMutationCount: 0,
    ...overrides,
  };
}

function createMockStateEngine<T>(initialValue: T): TestStateEngine<T> {
  const subscribers = new Set<StateSubscriber<T>>();
  let currentValue = cloneTestValue(initialValue);

  const engine = {
    get: vi.fn(() => {
      return cloneTestValue(currentValue);
    }),
    set: vi.fn((nextValue: T) => {
      currentValue = cloneTestValue(nextValue);
      const meta = createStateMeta({
        changedBy: 'local',
      });
      for (const subscriber of subscribers) {
        subscriber(engine.get(), meta);
      }
    }),
    patch: vi.fn(),
    undo: vi.fn(),
    reset: vi.fn(),
    subscribe(callback: StateSubscriber<T>) {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    emit(nextValue: T, meta: StateChangeMeta = createStateMeta()) {
      currentValue = cloneTestValue(nextValue);
      for (const subscriber of subscribers) {
        subscriber(engine.get(), meta);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } satisfies TestStateEngine<T>;

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
    presenceEngine?: TestPresenceEngine;
    stateEngine?: TestStateEngine<unknown>;
    viewportEngine?: TestViewportEngine;
  } = {},
): TestRoom {
  const handlers = new Map<RoomEventName, Set<RoomEventHandler>>();
  const peerId = config.peerId ?? `${roomId}-peer`;
  const awarenessEngine = config.awarenessEngine ?? createMockAwarenessEngine();
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const eventEngine = config.eventEngine ?? createMockEventEngine();
  const lockEngine = config.lockEngine ?? createMockLockEngine();
  const stateEngine = config.stateEngine ?? createMockStateEngine({});
  const viewportEngine = config.viewportEngine ?? createMockViewportEngine();
  const presenceEngine =
    config.presenceEngine ?? createMockPresenceEngine(peerId, [createPeer(peerId)]);
  let currentStatus: RoomStatus = 'idle';

  const room = {
    id: roomId,
    peerId,
    get status() {
      return currentStatus;
    },
    peers: presenceEngine.getAll().filter((peer) => {
      return peer.id !== peerId;
    }),
    peerCount: presenceEngine.getAll().length - 1,
    connect: vi.fn(async () => {
      return undefined;
    }),
    disconnect: vi.fn(async () => {
      return undefined;
    }),
    getDiagnostics: vi.fn(async () => {
      return {
        timestamp: 1,
        roomId,
        peerId,
        status: 'idle',
        transport: {
          current: null,
          lastDisconnectReason: null,
          reconnectAttempt: 0,
        },
        debug: {
          transport: false,
          state: false,
          presence: false,
          events: false,
          performance: false,
          productionInfoSuppressed: false,
        },
        peers: {
          remoteCount: presenceEngine.getAll().length - 1,
          remotePeerIds: presenceEngine
            .getAll()
            .filter((peer) => {
              return peer.id !== peerId;
            })
            .map((peer) => {
              return peer.id;
            }),
        },
        presence: {
          selfLastSeen: 1,
          heartbeatActive: false,
        },
        state: {
          configured: false,
          strategy: null,
          persistenceEnabled: false,
          queuedMutationCount: 0,
          offlineReplayInProgress: false,
          stateSizeBytes: null,
        },
        events: {
          registeredEventNames: [],
          messagesSent: 0,
          messagesReceived: 0,
          broadcastsSent: 0,
          directSends: 0,
          latestConnectDurationMs: null,
        },
        encryption: {
          enabled: false,
          incompatiblePeerIds: [],
          decryptionErrorPeerIds: [],
        },
      };
    }),
    usePresence: vi.fn(() => {
      return presenceEngine;
    }),
    useCursors: vi.fn(() => {
      return cursorEngine;
    }),
    useState: vi.fn(() => {
      return stateEngine;
    }),
    useAwareness: vi.fn(() => {
      return awarenessEngine;
    }),
    useViewport: vi.fn(() => {
      return viewportEngine;
    }),
    useLocks: vi.fn(() => {
      return lockEngine;
    }),
    useEvents: vi.fn(() => {
      return eventEngine;
    }),
    getYDoc: vi.fn(),
    getYProvider: vi.fn(),
    on: vi.fn((event: RoomEventName, handler: RoomEventHandler) => {
      const eventHandlers = handlers.get(event) ?? new Set<RoomEventHandler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
      return () => {
        eventHandlers.delete(handler);
      };
    }),
    off: vi.fn((event: RoomEventName, handler: RoomEventHandler) => {
      handlers.get(event)?.delete(handler);
    }),
    emit(event: RoomEventName, payload: RoomEventPayload) {
      switch (event) {
        case 'connected':
          currentStatus = 'connected';
          break;
        case 'reconnecting':
          currentStatus = 'reconnecting';
          break;
        case 'disconnected':
          currentStatus = 'disconnected';
          break;
        case 'error':
          currentStatus = 'error';
          break;
        default:
          break;
      }

      for (const handler of handlers.get(event) ?? []) {
        handler(payload);
      }
    },
    listenerCount(event: RoomEventName) {
      return handlers.get(event)?.size ?? 0;
    },
    setStatus(status: RoomStatus) {
      currentStatus = status;
    },
    awarenessEngine,
    cursorEngine,
    eventEngine,
    lockEngine,
    presenceEngine,
    stateEngine,
    viewportEngine,
  } satisfies TestRoom;

  createRoomMock.mockImplementationOnce(
    (nextRoomId: string, nextOptions: RoomOptions<PresenceData>) => {
      expect(nextRoomId).toBe(roomId);
      expect(nextOptions).toEqual(expect.objectContaining(options));
      return room;
    },
  );

  return room;
}

beforeEach(() => {
  createRoomMock.mockReset();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RoomfulPlugin', () => {
  it('creates one room, connects immediately, registers the directive, and disconnects on unmount', async () => {
    const cursorEngine = createMockCursorEngine();
    const room = createMockRoom(
      'plugin-room',
      {
        transport: 'broadcast',
        presence: {
          name: 'Ada',
        },
      },
      {
        cursorEngine,
      },
    );

    const wrapper = mount(
      defineComponent({
        template: '<div id="board" v-roomful-cursors></div>',
      }),
      {
        attachTo: document.body,
        global: {
          plugins: [
            [
              RoomfulPlugin,
              {
                roomId: 'plugin-room',
                transport: 'broadcast',
                presence: {
                  name: 'Ada',
                },
              },
            ],
          ],
        },
      },
    );

    const board = document.getElementById('board');

    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenCalledWith(board);

    wrapper.unmount();

    expect(cursorEngine.unmount).toHaveBeenCalledTimes(1);
    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });

  it('forwards connected, disconnected, and error events to plugin callbacks and cleans up', async () => {
    const room = createMockRoom('callback-room');
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const onError = vi.fn();

    const wrapper = mount(
      defineComponent({
        template: '<div></div>',
      }),
      {
        global: {
          plugins: [
            [
              RoomfulPlugin,
              {
                roomId: 'callback-room',
                onConnect,
                onDisconnect,
                onError,
              },
            ],
          ],
        },
      },
    );

    const error = new RoomfulError('NETWORK_ERROR', 'boom', true);
    room.emit('connected', undefined);
    room.emit('disconnected', { reason: 'manual' });
    room.emit('error', error);

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith({ reason: 'manual' });
    expect(onError).toHaveBeenCalledWith(error);

    wrapper.unmount();

    expect(room.listenerCount('connected')).toBe(0);
    expect(room.listenerCount('disconnected')).toBe(0);
    expect(room.listenerCount('error')).toBe(0);
  });
});

describe('useConnectionStatus', () => {
  it('tracks room status transitions and cleans up subscriptions on unmount', async () => {
    const room = createMockRoom('connection-status-room');
    const statuses: RoomStatus[] = [];

    const wrapper = mount(
      defineComponent({
        setup() {
          const status = useConnectionStatus();
          watchEffect(() => {
            statuses.push(status.value);
          });
          return () => null;
        },
      }),
      {
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'connection-status-room' }]],
        },
      },
    );

    room.emit('connected', undefined);
    await nextTick();
    room.emit('reconnecting', { attempt: 1 });
    await nextTick();
    room.emit('disconnected', { reason: 'manual' });
    await nextTick();
    room.emit('error', new RoomfulError('NETWORK_ERROR', 'boom', true));
    await nextTick();

    expect(statuses).toContain('idle');
    expect(statuses).toContain('connected');
    expect(statuses).toContain('reconnecting');
    expect(statuses).toContain('disconnected');
    expect(statuses).toContain('error');

    wrapper.unmount();

    expect(room.listenerCount('connected')).toBe(0);
    expect(room.listenerCount('reconnecting')).toBe(0);
    expect(room.listenerCount('disconnected')).toBe(0);
    expect(room.listenerCount('error')).toBe(0);
  });
});

describe('usePresence', () => {
  it('returns reactive refs, supports mutators, and auto-unwraps in templates', async () => {
    const self = createPeer('presence-self', { name: 'Ada' });
    const other = createPeer('presence-other', { name: 'Grace' });
    const presenceEngine = createMockPresenceEngine('presence-self', [self, other]);
    createMockRoom(
      'presence-room',
      {},
      {
        peerId: 'presence-self',
        presenceEngine,
      },
    );
    let observedPresence: UsePresenceResult<PresenceData> | null = null;

    const wrapper = mount(
      defineComponent({
        setup() {
          observedPresence = usePresence();
          return observedPresence;
        },
        template: '<div>{{ self.name }}|{{ others.length }}|{{ all.length }}</div>',
      }),
      {
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'presence-room' }]],
        },
      },
    );

    expect(wrapper.text()).toBe('Ada|1|2');

    observedPresence?.update({
      status: 'online',
    });
    observedPresence?.replace({
      name: 'Ada Lovelace',
    });

    expect(presenceEngine.update).toHaveBeenCalledWith({
      status: 'online',
    });
    expect(presenceEngine.replace).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
    });

    presenceEngine.emit([self, other, createPeer('presence-third', { name: 'Linus' })]);
    await nextTick();

    expect(wrapper.text()).toBe('Ada|2|3');

    wrapper.unmount();
  });

  it('skips deep-equal and lastSeen-only presence churn', async () => {
    const self = createPeer('equal-self', { name: 'Self' });
    const other = createPeer('equal-other', {
      name: 'Other',
      metadata: {
        role: 'editor',
      },
    });
    const presenceEngine = createMockPresenceEngine('equal-self', [self, other]);
    createMockRoom(
      'presence-equality',
      {},
      {
        peerId: 'equal-self',
        presenceEngine,
      },
    );
    let effectRuns = 0;

    const wrapper = mount(
      defineComponent({
        setup() {
          const presence = usePresence();
          watchEffect(() => {
            void presence.others.value.length;
            effectRuns += 1;
          });
          return presence;
        },
        template: '<div>{{ others.length }}</div>',
      }),
      {
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'presence-equality' }]],
        },
      },
    );

    presenceEngine.emit([
      createPeer('equal-self', { name: 'Self' }),
      createPeer('equal-other', {
        name: 'Other',
        metadata: {
          role: 'editor',
        },
      }),
    ]);
    await nextTick();

    presenceEngine.emit([
      createPeer('equal-self', { name: 'Self', lastSeen: 2 }),
      createPeer('equal-other', {
        name: 'Other',
        lastSeen: 99,
        metadata: {
          role: 'editor',
        },
      }),
    ]);
    await nextTick();

    expect(effectRuns).toBe(1);

    wrapper.unmount();
  });
});

describe('useCursors and v-roomful-cursors', () => {
  it('tracks a template ref, mounts automatically, and exposes reactive cursors', async () => {
    const remoteCursor = createCursor('cursor-peer', {
      tool: 'pen',
    });
    const cursorEngine = createMockCursorEngine([remoteCursor]);
    createMockRoom(
      'cursor-room',
      {},
      {
        cursorEngine,
      },
    );
    let observedCursors: UseCursorsResult<CursorData> | null = null;

    const wrapper = mount(
      defineComponent({
        setup() {
          observedCursors = useCursors();
          return {
            boardRef: observedCursors.ref,
            cursors: observedCursors.cursors,
          };
        },
        template:
          '<div><div id="cursor-board" ref="boardRef"></div><span>{{ cursors.length }}</span></div>',
      }),
      {
        attachTo: document.body,
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'cursor-room' }]],
        },
      },
    );
    const board = document.getElementById('cursor-board');

    expect(cursorEngine.mount).toHaveBeenCalledWith(board);
    expect(wrapper.text()).toContain('1');

    cursorEngine.emit([
      createCursor('cursor-peer', {
        tool: 'eraser',
      }),
      createCursor('cursor-peer-b', {
        tool: 'pen',
      }),
    ]);
    await nextTick();

    expect(wrapper.text()).toContain('2');

    observedCursors?.unmount();

    expect(cursorEngine.unmount).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('recreates directive bindings when options change and cleans them up', async () => {
    const firstCursorEngine = createMockCursorEngine();
    const secondCursorEngine = createMockCursorEngine();
    const room = createMockRoom(
      'directive-room',
      {},
      {
        cursorEngine: firstCursorEngine,
      },
    );
    room.useCursors = vi
      .fn()
      .mockImplementationOnce(() => firstCursorEngine)
      .mockImplementationOnce(() => secondCursorEngine);

    const wrapper = mount(
      defineComponent({
        data() {
          return {
            options: {
              throttleMs: 16,
            },
          };
        },
        template: '<div id="directive-board" v-roomful-cursors="options"></div>',
      }),
      {
        attachTo: document.body,
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'directive-room' }]],
        },
      },
    );
    const board = document.getElementById('directive-board');

    expect(firstCursorEngine.mount).toHaveBeenCalledWith(board);

    wrapper.vm.options = {
      throttleMs: 32,
    };
    await nextTick();

    expect(firstCursorEngine.unmount).toHaveBeenCalledTimes(1);
    expect(secondCursorEngine.mount).toHaveBeenCalledWith(board);

    wrapper.unmount();

    expect(secondCursorEngine.unmount).toHaveBeenCalledTimes(1);
  });
});

describe('useViewport', () => {
  it('tracks a template ref, mounts automatically, exposes reactive states, and forwards controls', async () => {
    const remoteViewport = createViewport('viewport-peer', {
      scrollY: 0.5,
    });
    const viewportEngine = createMockViewportEngine([remoteViewport]);
    createMockRoom(
      'viewport-room',
      {},
      {
        viewportEngine,
      },
    );
    let observedViewport: UseViewportResult | null = null;

    const wrapper = mount(
      defineComponent({
        setup() {
          observedViewport = useViewport();
          return {
            boardRef: observedViewport.ref,
            states: observedViewport.states,
          };
        },
        template:
          '<div><div id="viewport-board" ref="boardRef"></div><span>{{ states.length }}</span></div>',
      }),
      {
        attachTo: document.body,
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'viewport-room' }]],
        },
      },
    );
    const board = document.getElementById('viewport-board');

    expect(viewportEngine.mount).toHaveBeenCalledWith(board);
    expect(wrapper.text()).toContain('1');

    viewportEngine.emit([
      createViewport('viewport-peer', {
        scrollY: 0.9,
      }),
      createViewport('viewport-peer-b', {
        scrollY: 0.25,
      }),
    ]);
    await nextTick();

    expect(wrapper.text()).toContain('2');

    observedViewport?.broadcast();
    observedViewport?.stopBroadcast();
    observedViewport?.present();
    observedViewport?.stopPresenting();
    observedViewport?.follow('viewport-peer');
    observedViewport?.unfollow();

    expect(viewportEngine.broadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopBroadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.present).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopPresenting).toHaveBeenCalledTimes(1);
    expect(viewportEngine.follow).toHaveBeenCalledWith('viewport-peer');
    expect(viewportEngine.unfollow).toHaveBeenCalledTimes(1);

    observedViewport?.unmount();

    expect(viewportEngine.unmount).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});

describe('useLocks', () => {
  it('exposes held locks reactively and forwards the engine controls', async () => {
    const lockEngine = createMockLockEngine();
    lockEngine.setHolder('cell-1', createPeer('owner-peer'));
    createMockRoom(
      'locks-room',
      {},
      {
        lockEngine,
      },
    );
    let observedLocks: UseLocksResult | null = null;

    const wrapper = mount(
      defineComponent({
        setup() {
          observedLocks = useLocks();
          return {
            locks: observedLocks.locks,
          };
        },
        template: '<span>{{ locks.length }}</span>',
      }),
      {
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'locks-room' }]],
        },
      },
    );

    expect(wrapper.text()).toContain('1');
    expect(observedLocks?.locks.value).toEqual([expect.objectContaining({ key: 'cell-1' })]);
    expect(observedLocks?.isLocked('cell-1')).toBe(true);
    expect(observedLocks?.getHolder('cell-1')?.id).toBe('owner-peer');

    // A remote claim on a new key is reflected in the reactive list.
    lockEngine.emitAll([
      createLock('cell-1', createPeer('owner-peer')),
      createLock('cell-2', createPeer('peer-b')),
    ]);
    await nextTick();

    expect(wrapper.text()).toContain('2');
    expect(observedLocks?.getHolder('cell-2')?.id).toBe('peer-b');

    await observedLocks?.acquire('cell-3', { ttl: 1_000 });
    observedLocks?.release('cell-1');
    observedLocks?.releaseAll();

    expect(lockEngine.acquire).toHaveBeenCalledWith('cell-3', { ttl: 1_000 });
    expect(lockEngine.release).toHaveBeenCalledWith('cell-1');
    expect(lockEngine.releaseAll).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(lockEngine.allSubscriberCount()).toBe(0);
  });

  it('throws a typed error when useLocks() is called outside the plugin', () => {
    expect(() => {
      mount(
        defineComponent({
          setup() {
            useLocks();
            return {};
          },
          template: '<div />',
        }),
      );
    }).toThrowError(RoomfulError);
  });
});

describe('useLockState', () => {
  it('tracks a single key reactively and transitions free to held to free', async () => {
    const lockEngine = createMockLockEngine();
    createMockRoom(
      'lock-state-room',
      {},
      {
        lockEngine,
      },
    );
    const observed: Array<LockState | null> = [];

    const wrapper = mount(
      defineComponent({
        setup() {
          const state = useLockState('cell-1');
          watchEffect(() => {
            observed.push(state.value);
          });
          return {
            holderId: state,
          };
        },
        template: '<span>{{ holderId?.holder?.id ?? "free" }}</span>',
      }),
      {
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'lock-state-room' }]],
        },
      },
    );

    // Initially free.
    expect(wrapper.text()).toContain('free');
    expect(observed.at(-1)).toBeNull();

    lockEngine.emitKey('cell-1', createLock('cell-1', createPeer('owner-peer')));
    await nextTick();

    expect(wrapper.text()).toContain('owner-peer');
    expect(observed.at(-1)).toMatchObject({ key: 'cell-1', holder: { id: 'owner-peer' } });

    lockEngine.emitKey('cell-1', createLock('cell-1', null));
    await nextTick();

    expect(wrapper.text()).toContain('free');
    expect(observed.at(-1)).toBeNull();

    expect(lockEngine.keySubscriberCount('cell-1')).toBe(1);

    wrapper.unmount();
    expect(lockEngine.keySubscriberCount('cell-1')).toBe(0);
  });

  it('throws a typed error when useLockState() is called outside the plugin', () => {
    expect(() => {
      mount(
        defineComponent({
          setup() {
            useLockState('cell-1');
            return {};
          },
          template: '<div />',
        }),
      );
    }).toThrowError(RoomfulError);
  });
});

describe('useSharedState', () => {
  it('returns a ref and setter, supports direct and updater writes, and auto-unwraps in templates', async () => {
    const stateEngine = createMockStateEngine({
      count: 0,
    });
    createMockRoom(
      'shared-state-room',
      {},
      {
        stateEngine,
      },
    );
    let setValue:
      | ((
          nextValue: { count: number } | ((previous: { count: number }) => { count: number }),
        ) => void)
      | null = null;

    const wrapper = mount(
      defineComponent({
        setup() {
          const [state, setState] = useSharedState('counter', {
            initialValue: {
              count: 0,
            },
          });
          setValue = setState;
          return {
            state,
          };
        },
        template: '<div>{{ state.count }}</div>',
      }),
      {
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'shared-state-room' }]],
        },
      },
    );

    expect(wrapper.text()).toBe('0');

    setValue?.({
      count: 2,
    });

    expect(stateEngine.set).toHaveBeenCalledWith({
      count: 2,
    });

    setValue?.((previous) => {
      return {
        count: previous.count + 1,
      };
    });

    expect(stateEngine.set).toHaveBeenLastCalledWith({
      count: 3,
    });

    stateEngine.emit({
      count: 4,
    });
    await nextTick();

    expect(wrapper.text()).toBe('4');

    wrapper.unmount();
  });

  it('throws when the same room is bound to incompatible shared state keys', () => {
    createMockRoom('shared-state-mismatch');

    expect(() => {
      mount(
        defineComponent({
          setup() {
            useSharedState('first-key', {
              initialValue: {
                count: 0,
              },
            });
            useSharedState('second-key', {
              initialValue: {
                count: 0,
              },
            });
            return {};
          },
          template: '<div />',
        }),
        {
          global: {
            plugins: [[RoomfulPlugin, { roomId: 'shared-state-mismatch' }]],
          },
        },
      );
    }).toThrow('already bound to key');
  });
});

describe('useAwareness', () => {
  it('returns reactive refs, forwards mutators, and skips self-only churn', async () => {
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
    let observedAwareness: UseAwarenessResult | null = null;
    let effectRuns = 0;

    const wrapper = mount(
      defineComponent({
        setup() {
          observedAwareness = useAwareness();
          watchEffect(() => {
            void observedAwareness?.others.value.length;
            effectRuns += 1;
          });
          return observedAwareness;
        },
        template: '<div>{{ others.length }}</div>',
      }),
      {
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'awareness-room' }]],
        },
      },
    );

    expect(wrapper.text()).toBe('1');

    observedAwareness?.set({
      mode: 'draft',
    });
    observedAwareness?.setFocus('comment-1');
    observedAwareness?.setSelection({
      from: 1,
      to: 3,
      elementId: 'comment-1',
    });
    observedAwareness?.setTyping(false);

    expect(awarenessEngine.set).toHaveBeenCalledWith({
      mode: 'draft',
    });
    expect(awarenessEngine.setFocus).toHaveBeenCalledWith('comment-1');
    expect(awarenessEngine.setSelection).toHaveBeenCalledWith({
      from: 1,
      to: 3,
      elementId: 'comment-1',
    });
    expect(awarenessEngine.setTyping).toHaveBeenCalledWith(false);

    awarenessEngine.emit([
      createAwareness('awareness-self', {
        typing: false,
      }),
      createAwareness('awareness-other', {
        focus: 'editor-1',
      }),
    ]);
    await nextTick();

    expect(effectRuns).toBe(1);

    wrapper.unmount();
  });
});

describe('useEvent', () => {
  it('subscribes once, emits outbound events, and cleans up on unmount', async () => {
    const eventEngine = createMockEventEngine();
    createMockRoom(
      'event-room',
      {},
      {
        eventEngine,
      },
    );
    const received = vi.fn();
    let emitMessage: ((payload: { text: string }) => void) | null = null;

    const wrapper = mount(
      defineComponent({
        setup() {
          emitMessage = useEvent<{ text: string }>('message', received);
          return {};
        },
        template: '<div>events</div>',
      }),
      {
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'event-room' }]],
        },
      },
    );

    emitMessage?.({
      text: 'outbound',
    });
    eventEngine.deliver(
      'message',
      {
        text: 'inbound',
      },
      createPeer('sender-a', {
        name: 'Sender A',
      }),
    );
    await nextTick();

    expect(eventEngine.emit).toHaveBeenCalledWith('message', {
      text: 'outbound',
    });
    expect(received).toHaveBeenCalledWith(
      {
        text: 'inbound',
      },
      expect.objectContaining({
        id: 'sender-a',
        name: 'Sender A',
      }),
    );
    expect(eventEngine.subscriberCount('message')).toBe(1);

    wrapper.unmount();

    expect(eventEngine.subscriberCount('message')).toBe(0);
  });
});

describe('Options API support', () => {
  it('works inside an Options API component that also uses setup()', () => {
    const presenceEngine = createMockPresenceEngine('options-self', [
      createPeer('options-self', { name: 'Self' }),
      createPeer('options-peer', { name: 'Peer' }),
    ]);
    createMockRoom(
      'options-room',
      {},
      {
        peerId: 'options-self',
        presenceEngine,
      },
    );

    const wrapper = mount(
      defineComponent({
        data() {
          return {
            label: 'options',
          };
        },
        setup() {
          return usePresence();
        },
        template: '<div>{{ label }}-{{ others.length }}</div>',
      }),
      {
        global: {
          plugins: [[RoomfulPlugin, { roomId: 'options-room' }]],
        },
      },
    );

    expect(wrapper.text()).toBe('options-1');

    wrapper.unmount();
  });
});

describe('error handling', () => {
  it('throws a typed error when a composable is used without the plugin', () => {
    expect(() => {
      mount(
        defineComponent({
          setup() {
            usePresence();
            return {};
          },
          template: '<div />',
        }),
      );
    }).toThrowError(RoomfulError);
    expect(() => {
      mount(
        defineComponent({
          setup() {
            usePresence();
            return {};
          },
          template: '<div />',
        }),
      );
    }).toThrow('RoomfulPlugin');
  });
});
