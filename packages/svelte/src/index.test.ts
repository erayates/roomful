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
  RoomStatus,
  StateChangeMeta,
  StateEngine,
} from '@flockjs/core';
import { FlockError } from '@flockjs/core';
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

vi.mock('@flockjs/core', async () => {
  const actual = await vi.importActual<typeof import('@flockjs/core')>('@flockjs/core');

  return {
    ...actual,
    createRoom: createRoomMock,
  };
});

import type {
  AwarenessStoreValue,
  EventChannelValue,
  PresenceStoreValue,
} from './index';
import { flock } from './index';

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
  replace: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
  subscribe: ReturnType<typeof vi.fn<(cb: PresenceSubscriber) => () => void>>;
  update: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
};

type TestCursorEngine = CursorEngine<CursorData> & {
  emit(positions: CursorPosition<CursorData>[]): void;
  getPositions: ReturnType<typeof vi.fn<() => CursorPosition<CursorData>[]>>;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  render: ReturnType<typeof vi.fn<() => void>>;
  setPosition: ReturnType<
    typeof vi.fn<(position: Partial<CursorPosition<CursorData>>) => void>
  >;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: CursorSubscriber) => () => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
};

type TestAwarenessEngine = AwarenessEngine & {
  emit(peers: AwarenessState[]): void;
  set: ReturnType<typeof vi.fn<(value: Record<string, unknown>) => void>>;
  setFocus: ReturnType<typeof vi.fn<(elementId: string | null) => void>>;
  setSelection: ReturnType<
    typeof vi.fn<(selection: AwarenessState['selection'] | null) => void>
  >;
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
  emit: <TEvent extends RoomEventName>(event: TEvent, payload: RoomEventMap<PresenceData>[TEvent]) => void;
  eventEngine: TestEventEngine;
  listenerCount(event: RoomEventName): number;
  presenceEngine: TestPresenceEngine;
  setStatus(status: RoomStatus): void;
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

function createAwareness(
  peerId: string,
  overrides: Partial<AwarenessState> = {},
): AwarenessState {
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

function createMockCursorEngine(
  positions: CursorPosition<CursorData>[] = [],
): TestCursorEngine {
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
    peerId?: string;
    presenceEngine?: TestPresenceEngine;
    stateEngine?: TestStateEngine<unknown>;
    status?: RoomStatus;
  } = {},
): TestRoom {
  const handlers = new Map<RoomEventName, Set<RoomEventHandler>>();
  const peerId = config.peerId ?? `${roomId}-peer`;
  const awarenessEngine =
    config.awarenessEngine ?? createMockAwarenessEngine([createAwareness(peerId)]);
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const eventEngine = config.eventEngine ?? createMockEventEngine();
  const stateEngine = config.stateEngine ?? createMockStateEngine({});
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
    emit<TEvent extends RoomEventName>(
      event: TEvent,
      payload: RoomEventMap<PresenceData>[TEvent],
    ) {
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
    usePresence: vi.fn(() => {
      return presenceEngine;
    }),
    useState: vi.fn(() => {
      return stateEngine;
    }),
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

describe('flock', () => {
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

    const adapter = flock('svelte-room', {
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

    const adapter = flock('manual-room', {
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

    const adapter = flock('presence-room');
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

    const adapter = flock('awareness-room');
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

    const adapter = flock('cursor-room');
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

    const adapter = flock('state-room');
    const [countStore, setCount] = adapter.state.shared('counter', {
      count: 0,
    });
    const [sameStore, sameSetter] = adapter.state.shared('counter', {
      count: 0,
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

    adapter.state.shared(
      'counter',
      {
        count: 0,
      },
      {
        persist: true,
      },
    );
    expect(room.useState.mock.calls).toHaveLength(2);

    expect(() => {
      adapter.state.shared('different-key', {
        count: 0,
      });
    }).toThrow('already bound to key');
    expect(() => {
      adapter.state.shared(
        'counter',
        {
          count: 1,
        },
      );
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

    const adapter = flock('event-room');
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

    const adapter = flock<{ role: 'editor' | 'viewer' }, { tool: 'pen' | 'eraser' }>('typed-room');
    const [votes, setVotes] = adapter.state.shared('votes', {
      no: 0,
      yes: 0,
    });
    const reaction = adapter.events.channel<{ emoji: string }>('reaction');

    expectTypeOf(get(adapter.presence).others[0]?.role).toEqualTypeOf<
      'editor' | 'viewer' | undefined
    >();
    expectTypeOf(get(adapter.cursors)[0]?.tool).toEqualTypeOf<'pen' | 'eraser' | undefined>();
    expectTypeOf(votes).toMatchTypeOf<Writable<{ no: number; yes: number }>>();
    expectTypeOf(setVotes).toEqualTypeOf<
      (nextValue: { no: number; yes: number } | ((current: { no: number; yes: number }) => { no: number; yes: number })) => void
    >();
    expectTypeOf(get(reaction)?.payload.emoji).toEqualTypeOf<string | undefined>();
    expectTypeOf(adapter.cursors.mount).toEqualTypeOf<Action<HTMLElement, undefined>>();
  });

  it('throws typed errors for destroyed adapters', async () => {
    createMockRoom('destroyed-room');
    const adapter = flock('destroyed-room');

    await adapter.destroy();

    expect(() => {
      adapter.events.emit('message', {
        text: 'boom',
      });
    }).toThrowError(FlockError);
    expect(() => {
      adapter.presence.set({
        status: 'away',
      });
    }).toThrow('destroy()');
  });
});
