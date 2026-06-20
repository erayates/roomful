// @vitest-environment jsdom

import type {
  AwarenessEngine,
  AwarenessState,
  CursorData,
  CursorEngine,
  CursorPosition,
  EventEngine,
  Peer,
  PresenceData,
  PresenceEngine,
  Room,
  RoomEventMap,
  RoomEventName,
  RoomOptions,
  StateChangeMeta,
  StateEngine,
} from '@flockjs/core';
import { FlockError } from '@flockjs/core';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, watchEffect } from 'vue';

import type { UseAwarenessResult, UseCursorsResult, UsePresenceResult } from './index';
import {
  FlockPlugin,
  useAwareness,
  useCursors,
  useEvent,
  usePresence,
  useSharedState,
} from './index';

const { createRoomMock } = vi.hoisted(() => {
  return {
    createRoomMock: vi.fn(),
  };
});

vi.mock('@flockjs/core', async () => {
  const actual = await vi.importActual<typeof import('@flockjs/core')>('@flockjs/core');

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
  awarenessEngine: TestAwarenessEngine;
  cursorEngine: TestCursorEngine;
  eventEngine: TestEventEngine;
  presenceEngine: TestPresenceEngine;
  stateEngine: TestStateEngine<unknown>;
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
    peerId?: string;
    presenceEngine?: TestPresenceEngine;
    stateEngine?: TestStateEngine<unknown>;
  } = {},
): TestRoom {
  const handlers = new Map<RoomEventName, Set<RoomEventHandler>>();
  const peerId = config.peerId ?? `${roomId}-peer`;
  const awarenessEngine = config.awarenessEngine ?? createMockAwarenessEngine();
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const eventEngine = config.eventEngine ?? createMockEventEngine();
  const stateEngine = config.stateEngine ?? createMockStateEngine({});
  const presenceEngine =
    config.presenceEngine ?? createMockPresenceEngine(peerId, [createPeer(peerId)]);

  const room = {
    id: roomId,
    peerId,
    status: 'idle',
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
      for (const handler of handlers.get(event) ?? []) {
        handler(payload);
      }
    },
    listenerCount(event: RoomEventName) {
      return handlers.get(event)?.size ?? 0;
    },
    awarenessEngine,
    cursorEngine,
    eventEngine,
    presenceEngine,
    stateEngine,
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

describe('FlockPlugin', () => {
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
        template: '<div id="board" v-flock-cursors></div>',
      }),
      {
        attachTo: document.body,
        global: {
          plugins: [
            [
              FlockPlugin,
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
          plugins: [[FlockPlugin, { roomId: 'presence-room' }]],
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
          plugins: [[FlockPlugin, { roomId: 'presence-equality' }]],
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

describe('useCursors and v-flock-cursors', () => {
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
          plugins: [[FlockPlugin, { roomId: 'cursor-room' }]],
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
        template: '<div id="directive-board" v-flock-cursors="options"></div>',
      }),
      {
        attachTo: document.body,
        global: {
          plugins: [[FlockPlugin, { roomId: 'directive-room' }]],
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
          plugins: [[FlockPlugin, { roomId: 'shared-state-room' }]],
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
            plugins: [[FlockPlugin, { roomId: 'shared-state-mismatch' }]],
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
          plugins: [[FlockPlugin, { roomId: 'awareness-room' }]],
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
          plugins: [[FlockPlugin, { roomId: 'event-room' }]],
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
          plugins: [[FlockPlugin, { roomId: 'options-room' }]],
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
    }).toThrowError(FlockError);
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
    }).toThrow('FlockPlugin');
  });
});
