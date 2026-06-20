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
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

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

import type { UseAwarenessResult, UseCursorsResult, UsePresenceResult } from './index';
import {
  createReactHealth,
  FlockProvider,
  useAwareness,
  useConnectionStatus,
  useCursors,
  useEvent,
  usePeers,
  usePresence,
  useRoom,
  useSharedState,
} from './index';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

type RoomEventPayload = RoomEventMap<PresenceData>[RoomEventName];
type RoomEventHandler = (payload: RoomEventPayload) => void;
type AwarenessSubscriber = (peers: AwarenessState[]) => void;
type CursorSubscriber = (positions: CursorPosition<CursorData>[]) => void;
type EventSubscriber = (payload: unknown, from: Peer<PresenceData>) => void;
type PresenceSubscriber = (peers: Peer<PresenceData>[]) => void;
type StateSubscriber<T> = (value: T, meta: StateChangeMeta) => void;

interface RenderHarness {
  rerender(element: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}

type TestPresenceEngine = PresenceEngine<PresenceData> & {
  emit(peers: Peer<PresenceData>[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: PresenceSubscriber) => () => void>>;
  update: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
  replace: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
};

type TestCursorEngine = CursorEngine<CursorData> & {
  emit(positions: CursorPosition<CursorData>[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: CursorSubscriber) => () => void>>;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
  getPositions: ReturnType<typeof vi.fn<() => CursorPosition<CursorData>[]>>;
  setPosition: ReturnType<typeof vi.fn<(position: Partial<CursorPosition<CursorData>>) => void>>;
};

type TestAwarenessEngine = AwarenessEngine & {
  emit(peers: AwarenessState[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: AwarenessSubscriber) => () => void>>;
  set: ReturnType<typeof vi.fn<(value: Record<string, unknown>) => void>>;
  setFocus: ReturnType<typeof vi.fn<(elementId: string | null) => void>>;
  setSelection: ReturnType<typeof vi.fn<(selection: AwarenessState['selection'] | null) => void>>;
  setTyping: ReturnType<typeof vi.fn<(isTyping: boolean) => void>>;
};

type TestEventEngine = EventEngine<PresenceData> & {
  deliver(name: string, payload: unknown, from?: Peer<PresenceData>): void;
  subscriberCount(name: string): number;
  emit: ReturnType<typeof vi.fn<(name: string, payload: unknown) => void>>;
  emitTo: ReturnType<typeof vi.fn<(peerId: string, name: string, payload: unknown) => void>>;
  on: ReturnType<typeof vi.fn<(name: string, cb: EventSubscriber) => () => void>>;
  off: ReturnType<typeof vi.fn<(name: string, cb: EventSubscriber) => void>>;
};

type TestStateEngine<T> = StateEngine<T> & {
  emit(value: T, meta?: StateChangeMeta): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: StateSubscriber<T>) => () => void>>;
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
  setPeers(peers: Peer<PresenceData>[]): void;
  setStatus(status: RoomStatus): void;
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
    subscribe: vi.fn((callback: PresenceSubscriber) => {
      subscribers.add(callback);
      callback(currentPeers);

      return () => {
        subscribers.delete(callback);
      };
    }),
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
  } as TestPresenceEngine;

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
    emit(nextPeers: AwarenessState[]) {
      currentPeers = nextPeers;
      for (const subscriber of subscribers) {
        subscriber(currentPeers);
      }
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
    mount: vi.fn(),
    unmount: vi.fn(),
    render: vi.fn(),
    setPosition: vi.fn(),
    getPositions: vi.fn(() => {
      return currentPositions;
    }),
    subscribe: vi.fn((callback: CursorSubscriber) => {
      subscribers.add(callback);
      callback(currentPositions);

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextPositions: CursorPosition<CursorData>[]) {
      currentPositions = nextPositions;
      for (const subscriber of subscribers) {
        subscriber(currentPositions);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestCursorEngine;

  return engine;
}

function createMockEventEngine(): TestEventEngine {
  const subscribers = new Map<string, Set<EventSubscriber>>();

  const engine = {
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
    off: vi.fn((name: string, callback: EventSubscriber) => {
      const handlers = subscribers.get(name);
      if (!handlers) {
        return;
      }

      handlers.delete(callback);
      if (handlers.size === 0) {
        subscribers.delete(name);
      }
    }),
    deliver(name: string, payload: unknown, from = createPeer('event-source')) {
      for (const subscriber of subscribers.get(name) ?? []) {
        subscriber(payload, from);
      }
    },
    subscriberCount(name: string) {
      return subscribers.get(name)?.size ?? 0;
    },
  } as TestEventEngine;

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
    subscribe: vi.fn((callback: StateSubscriber<T>) => {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextValue: T, meta: StateChangeMeta = createStateMeta()) {
      currentValue = cloneTestValue(nextValue);
      for (const subscriber of subscribers) {
        subscriber(engine.get(), meta);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
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
    status?: RoomStatus;
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
  let currentStatus = config.status ?? 'idle';
  let currentPeers = presenceEngine.getAll().filter((peer) => {
    return peer.id !== peerId;
  });

  const originalPresenceEmit = presenceEngine.emit.bind(presenceEngine);
  presenceEngine.emit = (nextPeers: Peer<PresenceData>[]) => {
    currentPeers = nextPeers.filter((peer) => {
      return peer.id !== peerId;
    });
    originalPresenceEmit(nextPeers);
  };

  const room = {
    id: roomId,
    peerId,
    get status() {
      return currentStatus;
    },
    get peers() {
      return currentPeers;
    },
    get peerCount() {
      return currentPeers.length;
    },
    connect: vi.fn(async () => {
      currentStatus = 'connecting';
      return undefined;
    }),
    disconnect: vi.fn(async () => {
      currentStatus = 'disconnected';
      return undefined;
    }),
    getDiagnostics: vi.fn(async () => {
      return {
        timestamp: 1,
        roomId,
        peerId,
        status: currentStatus,
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
          remoteCount: currentPeers.length,
          remotePeerIds: currentPeers.map((peer) => {
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
    emit: (event: RoomEventName, payload: RoomEventPayload) => {
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
    setPeers(peers: Peer<PresenceData>[]) {
      currentPeers = peers;
    },
    setStatus(status: RoomStatus) {
      currentStatus = status;
    },
    awarenessEngine,
    cursorEngine,
    eventEngine,
    presenceEngine,
    stateEngine,
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

async function renderElement(element: ReactNode): Promise<RenderHarness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return {
    rerender: async (nextElement) => {
      await act(async () => {
        root.render(nextElement);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

beforeEach(() => {
  createRoomMock.mockReset();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createReactHealth', () => {
  it('returns expected React health metadata including core dependency', () => {
    expect(createReactHealth()).toEqual({
      packageName: '@flockjs/react',
      status: 'ok',
      dependencies: {
        core: {
          packageName: '@flockjs/core',
          status: 'ok',
        },
      },
    });
  });
});

describe('FlockProvider', () => {
  it('creates a room during render, connects on mount, and exposes it via useRoom()', async () => {
    const room = createMockRoom('provider-room', {
      transport: 'broadcast',
    });
    let observedRoom: Room<PresenceData> | null = null;

    function RoomConsumer(): null {
      observedRoom = useRoom();
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'provider-room',
          transport: 'broadcast',
        },
        createElement(RoomConsumer),
      ),
    );

    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(observedRoom).toBe(room);

    await harness.unmount();
  });

  it('disconnects the room cleanly on unmount', async () => {
    const room = createMockRoom('disconnect-room');
    const harness = await renderElement(
      createElement(FlockProvider, { roomId: 'disconnect-room' }),
    );

    await harness.unmount();

    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });

  it('forwards connected, disconnected, and error events to provider callbacks', async () => {
    const room = createMockRoom('callback-room');
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const onError = vi.fn();
    const harness = await renderElement(
      createElement(FlockProvider, {
        roomId: 'callback-room',
        onConnect,
        onDisconnect,
        onError,
      }),
    );
    const error = new FlockError('NETWORK_ERROR', 'boom', true);

    room.emit('connected', undefined);
    room.emit('disconnected', { reason: 'manual' });
    room.emit('error', error);

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith({ reason: 'manual' });
    expect(onError).toHaveBeenCalledWith(error);

    await harness.unmount();
  });

  it('does not recreate or reconnect when rerendered with equivalent room props', async () => {
    const room = createMockRoom('stable-room', {
      transport: 'broadcast',
      presence: {
        name: 'Ada',
      },
      stunUrls: ['stun:1.example.net', 'stun:2.example.net'],
    });
    const initialOnConnect = vi.fn();
    const updatedOnConnect = vi.fn();
    const harness = await renderElement(
      createElement(FlockProvider, {
        roomId: 'stable-room',
        transport: 'broadcast',
        presence: {
          name: 'Ada',
        },
        stunUrls: ['stun:1.example.net', 'stun:2.example.net'],
        onConnect: initialOnConnect,
      }),
    );

    await harness.rerender(
      createElement(FlockProvider, {
        roomId: 'stable-room',
        transport: 'broadcast',
        presence: {
          name: 'Ada',
        },
        stunUrls: ['stun:1.example.net', 'stun:2.example.net'],
        onConnect: updatedOnConnect,
      }),
    );

    room.emit('connected', undefined);

    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(initialOnConnect).toHaveBeenCalledTimes(0);
    expect(updatedOnConnect).toHaveBeenCalledTimes(1);

    await harness.unmount();
  });

  it('recreates the room when the roomId changes', async () => {
    const firstRoom = createMockRoom('room-a');
    const secondRoom = createMockRoom('room-b');
    const harness = await renderElement(createElement(FlockProvider, { roomId: 'room-a' }));

    await harness.rerender(createElement(FlockProvider, { roomId: 'room-b' }));

    expect(createRoomMock).toHaveBeenCalledTimes(2);
    expect(firstRoom.connect).toHaveBeenCalledTimes(1);
    expect(firstRoom.disconnect).toHaveBeenCalledTimes(1);
    expect(secondRoom.connect).toHaveBeenCalledTimes(1);
    expect(secondRoom.disconnect).toHaveBeenCalledTimes(0);

    await harness.unmount();
    expect(secondRoom.disconnect).toHaveBeenCalledTimes(1);
  });

  it('recreates the room when a room-defining option changes', async () => {
    const firstRoom = createMockRoom('option-room', {
      transport: 'broadcast',
      debug: {
        transport: false,
      },
    });
    const secondRoom = createMockRoom('option-room', {
      transport: 'websocket',
      debug: {
        transport: true,
      },
    });
    const harness = await renderElement(
      createElement(FlockProvider, {
        roomId: 'option-room',
        transport: 'broadcast',
        debug: {
          transport: false,
        },
      }),
    );

    await harness.rerender(
      createElement(FlockProvider, {
        roomId: 'option-room',
        transport: 'websocket',
        debug: {
          transport: true,
        },
      }),
    );

    expect(createRoomMock).toHaveBeenCalledTimes(2);
    expect(firstRoom.disconnect).toHaveBeenCalledTimes(1);
    expect(secondRoom.connect).toHaveBeenCalledTimes(1);

    await harness.unmount();
  });

  it('throws a typed error when useRoom() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useRoom();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(FlockError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('FlockProvider');
  });
});

describe('usePresence', () => {
  it('returns self, others, all, and presence mutators', async () => {
    const self = createPeer('presence-self', { name: 'Ada' });
    const other = createPeer('presence-other', { name: 'Grace', role: 'editor' });
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

    function PresenceConsumer(): null {
      observedPresence = usePresence();
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'presence-room',
        },
        createElement(PresenceConsumer),
      ),
    );

    expect(observedPresence?.self).toEqual(self);
    expect(observedPresence?.others).toEqual([other]);
    expect(observedPresence?.all).toEqual([self, other]);

    observedPresence?.update({ status: 'online' });
    observedPresence?.replace({ name: 'Ada Lovelace' });

    expect(presenceEngine.update).toHaveBeenCalledWith({ status: 'online' });
    expect(presenceEngine.replace).toHaveBeenCalledWith({ name: 'Ada Lovelace' });

    await harness.unmount();
  });

  it('rerenders when peers join, leave, or meaningfully update', async () => {
    const self = createPeer('react-self', { name: 'Self' });
    const peerA = createPeer('react-peer-a', { name: 'Peer A' });
    const peerB = createPeer('react-peer-b', { name: 'Peer B' });
    const presenceEngine = createMockPresenceEngine('react-self', [self]);
    createMockRoom(
      'presence-reactivity',
      {},
      {
        peerId: 'react-self',
        presenceEngine,
      },
    );
    const snapshots: UsePresenceResult<PresenceData>[] = [];

    function PresenceConsumer(): null {
      snapshots.push(usePresence());
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'presence-reactivity',
        },
        createElement(PresenceConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([self, peerA]);
    });
    await act(async () => {
      presenceEngine.emit([self, peerA, peerB]);
    });
    await act(async () => {
      presenceEngine.emit([
        self,
        createPeer('react-peer-a', { name: 'Peer A+', role: 'editor' }),
        peerB,
      ]);
    });
    await act(async () => {
      presenceEngine.emit([self, peerB]);
    });

    expect(snapshots).toHaveLength(5);
    expect(snapshots[1]?.others.map((peer) => peer.id)).toEqual(['react-peer-a']);
    expect(snapshots[2]?.others.map((peer) => peer.id)).toEqual(['react-peer-a', 'react-peer-b']);
    expect(snapshots[3]?.others[0]).toMatchObject({
      id: 'react-peer-a',
      name: 'Peer A+',
      role: 'editor',
    });
    expect(snapshots[4]?.others.map((peer) => peer.id)).toEqual(['react-peer-b']);

    await harness.unmount();
  });

  it('does not rerender when peer data is deep-equal or only lastSeen changes', async () => {
    const self = createPeer('equal-self', { name: 'Self' });
    const other = createPeer('equal-other', {
      name: 'Other',
      metadata: {
        role: 'editor',
        permissions: ['read', 'write'],
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
    let renderCount = 0;

    function PresenceConsumer(): null {
      usePresence();
      renderCount += 1;
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'presence-equality',
        },
        createElement(PresenceConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([
        createPeer('equal-self', { name: 'Self' }),
        createPeer('equal-other', {
          name: 'Other',
          metadata: {
            role: 'editor',
            permissions: ['read', 'write'],
          },
        }),
      ]);
    });
    await act(async () => {
      presenceEngine.emit([
        createPeer('equal-self', { name: 'Self', lastSeen: 2 }),
        createPeer('equal-other', {
          name: 'Other',
          lastSeen: 99,
          metadata: {
            role: 'editor',
            permissions: ['read', 'write'],
          },
        }),
      ]);
    });

    expect(renderCount).toBe(1);

    await harness.unmount();
  });

  it('preserves stable slice references when unchanged', async () => {
    const self = createPeer('stable-self', { name: 'Self', role: 'owner' });
    const other = createPeer('stable-other', { name: 'Other', role: 'editor' });
    const presenceEngine = createMockPresenceEngine('stable-self', [self, other]);
    createMockRoom(
      'presence-stable-slices',
      {},
      {
        peerId: 'stable-self',
        presenceEngine,
      },
    );
    const snapshots: UsePresenceResult<PresenceData>[] = [];

    function PresenceConsumer(): null {
      snapshots.push(usePresence());
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'presence-stable-slices',
        },
        createElement(PresenceConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([
        createPeer('stable-self', { name: 'Self Renamed', role: 'owner' }),
        createPeer('stable-other', { name: 'Other', role: 'editor' }),
      ]);
    });
    await act(async () => {
      presenceEngine.emit([
        createPeer('stable-self', { name: 'Self Renamed', role: 'owner' }),
        createPeer('stable-other', { name: 'Other+', role: 'editor' }),
      ]);
    });

    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]?.others).toBe(snapshots[0]?.others);
    expect(snapshots[2]?.self).toBe(snapshots[1]?.self);

    await harness.unmount();
  });

  it('follows room replacement and resubscribes to the new room presence engine', async () => {
    const roomAPresence = createMockPresenceEngine('room-a-peer', [
      createPeer('room-a-peer', { name: 'Room A Self' }),
    ]);
    const roomBPresence = createMockPresenceEngine('room-b-peer', [
      createPeer('room-b-peer', { name: 'Room B Self' }),
    ]);
    createMockRoom(
      'presence-room-a',
      {},
      {
        peerId: 'room-a-peer',
        presenceEngine: roomAPresence,
      },
    );
    createMockRoom(
      'presence-room-b',
      {},
      {
        peerId: 'room-b-peer',
        presenceEngine: roomBPresence,
      },
    );
    const snapshots: UsePresenceResult<PresenceData>[] = [];

    function PresenceConsumer(): null {
      snapshots.push(usePresence());
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'presence-room-a',
        },
        createElement(PresenceConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'presence-room-b',
        },
        createElement(PresenceConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomAPresence.emit([
        createPeer('room-a-peer', { name: 'Room A Self' }),
        createPeer('room-a-other', { name: 'A Other' }),
      ]);
    });
    await act(async () => {
      roomBPresence.emit([
        createPeer('room-b-peer', { name: 'Room B Self' }),
        createPeer('room-b-other', { name: 'B Other' }),
      ]);
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots[1]?.self.id).toBe('room-b-peer');
    expect(snapshots[1]?.all).toEqual([createPeer('room-b-peer', { name: 'Room B Self' })]);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]?.others.map((peer) => peer.id)).toEqual(['room-b-other']);
    expect(roomAPresence.subscriberCount()).toBe(0);
    expect(roomBPresence.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('throws a typed error when usePresence() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      usePresence();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(FlockError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('FlockProvider');
  });
});

describe('useAwareness', () => {
  it('returns remote awareness and forwards awareness mutators', async () => {
    const self = createAwareness('awareness-self', {
      typing: true,
    });
    const other = createAwareness('awareness-other', {
      focus: 'editor-1',
      selection: {
        from: 1,
        to: 3,
        elementId: 'editor-1',
      },
      theme: 'dark',
    });
    const awarenessEngine = createMockAwarenessEngine([self, other]);
    createMockRoom(
      'awareness-room',
      {},
      {
        awarenessEngine,
        peerId: 'awareness-self',
      },
    );
    let observedAwareness: UseAwarenessResult | null = null;

    function AwarenessConsumer(): null {
      observedAwareness = useAwareness();
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'awareness-room',
        },
        createElement(AwarenessConsumer),
      ),
    );

    expect(observedAwareness?.others).toEqual([other]);

    observedAwareness?.set({
      mode: 'draft',
    });
    observedAwareness?.setFocus('comment-1');
    observedAwareness?.setSelection({
      from: 5,
      to: 8,
      elementId: 'comment-1',
    });
    observedAwareness?.setTyping(false);

    expect(awarenessEngine.set).toHaveBeenCalledWith({
      mode: 'draft',
    });
    expect(awarenessEngine.setFocus).toHaveBeenCalledWith('comment-1');
    expect(awarenessEngine.setSelection).toHaveBeenCalledWith({
      from: 5,
      to: 8,
      elementId: 'comment-1',
    });
    expect(awarenessEngine.setTyping).toHaveBeenCalledWith(false);

    await harness.unmount();
  });

  it('rerenders for remote awareness changes and skips self-only or deep-equal updates', async () => {
    const self = createAwareness('awareness-reactive-self', {
      typing: false,
    });
    const other = createAwareness('awareness-reactive-other', {
      focus: 'editor-1',
      metadata: {
        mode: 'draft',
      },
    });
    const awarenessEngine = createMockAwarenessEngine([self, other]);
    createMockRoom(
      'awareness-reactivity',
      {},
      {
        awarenessEngine,
        peerId: 'awareness-reactive-self',
      },
    );
    const snapshots: UseAwarenessResult[] = [];
    let renderCount = 0;

    function AwarenessConsumer(): null {
      const awareness = useAwareness();
      renderCount += 1;
      snapshots.push(awareness);
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'awareness-reactivity',
        },
        createElement(AwarenessConsumer),
      ),
    );

    await act(async () => {
      awarenessEngine.emit([
        createAwareness('awareness-reactive-self', {
          typing: true,
        }),
        createAwareness('awareness-reactive-other', {
          focus: 'editor-1',
          metadata: {
            mode: 'draft',
          },
        }),
      ]);
    });
    await act(async () => {
      awarenessEngine.emit([
        createAwareness('awareness-reactive-self', {
          typing: true,
        }),
        createAwareness('awareness-reactive-other', {
          focus: 'editor-2',
          metadata: {
            mode: 'review',
          },
        }),
      ]);
    });
    await act(async () => {
      awarenessEngine.emit([
        createAwareness('awareness-reactive-self', {
          typing: true,
        }),
        createAwareness('awareness-reactive-other', {
          focus: 'editor-2',
          metadata: {
            mode: 'review',
          },
        }),
      ]);
    });

    expect(renderCount).toBe(2);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.others).toEqual([
      createAwareness('awareness-reactive-other', {
        focus: 'editor-2',
        metadata: {
          mode: 'review',
        },
      }),
    ]);

    await harness.unmount();
  });

  it('keeps mutators stable across room replacement and cleans up old subscriptions', async () => {
    const roomAAwareness = createMockAwarenessEngine([
      createAwareness('awareness-room-a-peer', {
        focus: 'board-a',
      }),
    ]);
    const roomBAwareness = createMockAwarenessEngine([
      createAwareness('awareness-room-b-peer', {
        focus: 'board-b',
      }),
    ]);
    createMockRoom(
      'awareness-room-a',
      {},
      {
        awarenessEngine: roomAAwareness,
        peerId: 'awareness-room-a-peer',
      },
    );
    createMockRoom(
      'awareness-room-b',
      {},
      {
        awarenessEngine: roomBAwareness,
        peerId: 'awareness-room-b-peer',
      },
    );
    const snapshots: UseAwarenessResult[] = [];

    function AwarenessConsumer(): null {
      snapshots.push(useAwareness());
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'awareness-room-a',
        },
        createElement(AwarenessConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'awareness-room-b',
        },
        createElement(AwarenessConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomAAwareness.emit([
        createAwareness('awareness-room-a-peer', {
          focus: 'board-a',
        }),
        createAwareness('awareness-room-a-other', {
          typing: true,
        }),
      ]);
    });
    await act(async () => {
      snapshots[1]?.setTyping(true);
      roomBAwareness.emit([
        createAwareness('awareness-room-b-peer', {
          focus: 'board-b',
        }),
        createAwareness('awareness-room-b-other', {
          typing: true,
        }),
      ]);
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]?.set).toBe(snapshots[0]?.set);
    expect(snapshots[1]?.setFocus).toBe(snapshots[0]?.setFocus);
    expect(snapshots[1]?.setSelection).toBe(snapshots[0]?.setSelection);
    expect(snapshots[1]?.setTyping).toBe(snapshots[0]?.setTyping);
    expect(snapshots[2]?.others).toEqual([
      createAwareness('awareness-room-b-other', {
        typing: true,
      }),
    ]);
    expect(roomAAwareness.subscriberCount()).toBe(0);
    expect(roomBAwareness.subscriberCount()).toBe(1);
    expect(roomAAwareness.setTyping).toHaveBeenCalledTimes(0);
    expect(roomBAwareness.setTyping).toHaveBeenCalledWith(true);

    await harness.unmount();

    expect(roomBAwareness.subscriberCount()).toBe(0);
  });
});

describe('usePeers', () => {
  it('returns reactive remote peers and excludes the local peer', async () => {
    const self = createPeer('peers-self', {
      name: 'Self',
    });
    const peerA = createPeer('peers-a', {
      name: 'Peer A',
    });
    const peerB = createPeer('peers-b', {
      name: 'Peer B',
    });
    const presenceEngine = createMockPresenceEngine('peers-self', [self, peerA]);
    createMockRoom(
      'peers-room',
      {},
      {
        peerId: 'peers-self',
        presenceEngine,
      },
    );
    const snapshots: Peer<PresenceData>[][] = [];

    function PeersConsumer(): null {
      snapshots.push(usePeers());
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'peers-room',
        },
        createElement(PeersConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([self, peerA, peerB]);
    });

    expect(snapshots).toEqual([[peerA], [peerA, peerB]]);

    await harness.unmount();
  });

  it('skips deep-equal peer updates and lastSeen-only churn', async () => {
    const self = createPeer('peers-equal-self', {
      name: 'Self',
    });
    const other = createPeer('peers-equal-other', {
      name: 'Other',
      metadata: {
        role: 'editor',
      },
    });
    const presenceEngine = createMockPresenceEngine('peers-equal-self', [self, other]);
    createMockRoom(
      'peers-equality',
      {},
      {
        peerId: 'peers-equal-self',
        presenceEngine,
      },
    );
    let renderCount = 0;

    function PeersConsumer(): null {
      usePeers();
      renderCount += 1;
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'peers-equality',
        },
        createElement(PeersConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([
        createPeer('peers-equal-self', {
          name: 'Self',
        }),
        createPeer('peers-equal-other', {
          name: 'Other',
          metadata: {
            role: 'editor',
          },
        }),
      ]);
    });
    await act(async () => {
      presenceEngine.emit([
        createPeer('peers-equal-self', {
          name: 'Self',
          lastSeen: 2,
        }),
        createPeer('peers-equal-other', {
          name: 'Other',
          lastSeen: 99,
          metadata: {
            role: 'editor',
          },
        }),
      ]);
    });

    expect(renderCount).toBe(1);

    await harness.unmount();
  });

  it('follows room replacement and resubscribes to the new peer source', async () => {
    const roomAPresence = createMockPresenceEngine('peers-room-a-peer', [
      createPeer('peers-room-a-peer', {
        name: 'Room A Self',
      }),
    ]);
    const roomBPresence = createMockPresenceEngine('peers-room-b-peer', [
      createPeer('peers-room-b-peer', {
        name: 'Room B Self',
      }),
    ]);
    createMockRoom(
      'peers-room-a',
      {},
      {
        peerId: 'peers-room-a-peer',
        presenceEngine: roomAPresence,
      },
    );
    createMockRoom(
      'peers-room-b',
      {},
      {
        peerId: 'peers-room-b-peer',
        presenceEngine: roomBPresence,
      },
    );
    const snapshots: Peer<PresenceData>[][] = [];

    function PeersConsumer(): null {
      snapshots.push(usePeers());
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'peers-room-a',
        },
        createElement(PeersConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'peers-room-b',
        },
        createElement(PeersConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomAPresence.emit([
        createPeer('peers-room-a-peer', {
          name: 'Room A Self',
        }),
        createPeer('peers-room-a-other', {
          name: 'A Other',
        }),
      ]);
    });
    await act(async () => {
      roomBPresence.emit([
        createPeer('peers-room-b-peer', {
          name: 'Room B Self',
        }),
        createPeer('peers-room-b-other', {
          name: 'B Other',
        }),
      ]);
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots[1]).toEqual([]);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]).toEqual([
      createPeer('peers-room-b-other', {
        name: 'B Other',
      }),
    ]);
    expect(roomAPresence.subscriberCount()).toBe(0);
    expect(roomBPresence.subscriberCount()).toBe(1);

    await harness.unmount();
  });
});

describe('useConnectionStatus', () => {
  it('tracks room status transitions, including the initial connecting state', async () => {
    const room = createMockRoom('connection-status-room');
    const statuses: RoomStatus[] = [];

    function StatusConsumer(): null {
      statuses.push(useConnectionStatus());
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'connection-status-room',
        },
        createElement(StatusConsumer),
      ),
    );

    await act(async () => {
      room.emit('connected', undefined);
    });
    await act(async () => {
      room.emit('reconnecting', {
        attempt: 1,
      });
    });
    await act(async () => {
      room.emit('disconnected', {
        reason: 'manual',
      });
    });
    await act(async () => {
      room.emit('error', new FlockError('NETWORK_ERROR', 'boom', true));
    });

    expect(statuses).toContain('idle');
    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
    expect(statuses).toContain('reconnecting');
    expect(statuses).toContain('disconnected');
    expect(statuses).toContain('error');

    await harness.unmount();

    expect(room.listenerCount('connected')).toBe(0);
    expect(room.listenerCount('reconnecting')).toBe(0);
    expect(room.listenerCount('disconnected')).toBe(0);
    expect(room.listenerCount('error')).toBe(0);
  });
});

describe('useEvent', () => {
  it('subscribes once, emits outbound events, and delivers to the latest handler', async () => {
    const eventEngine = createMockEventEngine();
    createMockRoom(
      'event-room',
      {},
      {
        eventEngine,
      },
    );
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const emitters: Array<(payload: { text: string }) => void> = [];
    let useUpdatedHandler = false;

    function EventConsumer(): null {
      const emitMessage = useEvent<{ text: string }>(
        'message',
        useUpdatedHandler ? secondHandler : firstHandler,
      );
      emitters.push(emitMessage);
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'event-room',
        },
        createElement(EventConsumer),
      ),
    );

    await act(async () => {
      emitters[0]?.({
        text: 'outbound',
      });
    });
    await act(async () => {
      eventEngine.deliver(
        'message',
        {
          text: 'first',
        },
        createPeer('sender-a', {
          name: 'Sender A',
        }),
      );
    });

    useUpdatedHandler = true;
    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'event-room',
        },
        createElement(EventConsumer),
      ),
    );

    await act(async () => {
      eventEngine.deliver(
        'message',
        {
          text: 'second',
        },
        createPeer('sender-b', {
          name: 'Sender B',
        }),
      );
    });

    expect(eventEngine.emit).toHaveBeenCalledWith('message', {
      text: 'outbound',
    });
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler).toHaveBeenCalledWith(
      {
        text: 'first',
      },
      expect.objectContaining({
        id: 'sender-a',
        name: 'Sender A',
      }),
    );
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledWith(
      {
        text: 'second',
      },
      expect.objectContaining({
        id: 'sender-b',
        name: 'Sender B',
      }),
    );
    expect(eventEngine.on).toHaveBeenCalledTimes(1);
    expect(eventEngine.subscriberCount('message')).toBe(1);
    expect(emitters[1]).toBe(emitters[0]);

    await harness.unmount();

    expect(eventEngine.subscriberCount('message')).toBe(0);
  });

  it('resubscribes on room replacement and keeps emit stable', async () => {
    const roomAEvents = createMockEventEngine();
    const roomBEvents = createMockEventEngine();
    createMockRoom(
      'event-room-a',
      {},
      {
        eventEngine: roomAEvents,
      },
    );
    createMockRoom(
      'event-room-b',
      {},
      {
        eventEngine: roomBEvents,
      },
    );
    const received = vi.fn();
    const emitters: Array<(payload: { value: number }) => void> = [];

    function EventConsumer(): null {
      const emitValue = useEvent<{ value: number }>('value', received);
      emitters.push(emitValue);
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'event-room-a',
        },
        createElement(EventConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'event-room-b',
        },
        createElement(EventConsumer),
      ),
    );

    await act(async () => {
      roomAEvents.deliver('value', {
        value: 1,
      });
    });
    await act(async () => {
      roomBEvents.deliver('value', {
        value: 2,
      });
      emitters[1]?.({
        value: 3,
      });
    });

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(
      {
        value: 2,
      },
      expect.objectContaining({
        id: 'event-source',
      }),
    );
    expect(roomAEvents.subscriberCount('value')).toBe(0);
    expect(roomBEvents.subscriberCount('value')).toBe(1);
    expect(emitters[1]).toBe(emitters[0]);
    expect(roomAEvents.emit).toHaveBeenCalledTimes(0);
    expect(roomBEvents.emit).toHaveBeenCalledWith('value', {
      value: 3,
    });

    await harness.unmount();

    expect(roomBEvents.subscriberCount('value')).toBe(0);
  });

  it('preserves event emit and handler types', () => {
    function TypeConsumer(): null {
      const emitMessage = useEvent<{ text: string }>('message', (payload, from) => {
        expectTypeOf(payload).toEqualTypeOf<{ text: string }>();
        expectTypeOf(from).toEqualTypeOf<Peer<PresenceData>>();
      });

      expectTypeOf(emitMessage).toEqualTypeOf<(payload: { text: string }) => void>();

      return null;
    }

    expect(TypeConsumer).toBeTypeOf('function');
  });
});

describe('useCursors', () => {
  it('returns ref, cursors, mount, and unmount while auto-mounting the tracked element', async () => {
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

    function CursorConsumer(): ReactNode {
      observedCursors = useCursors();
      return createElement('div', {
        id: 'cursor-board',
        ref: observedCursors.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'cursor-room',
        },
        createElement(CursorConsumer),
      ),
    );
    const board = document.getElementById('cursor-board') as HTMLElement;

    expect(observedCursors?.cursors).toEqual([remoteCursor]);
    expect(typeof observedCursors?.ref).toBe('function');
    expect(typeof observedCursors?.mount).toBe('function');
    expect(typeof observedCursors?.unmount).toBe('function');
    expect(cursorEngine.mount).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(board);

    await act(async () => {
      observedCursors?.unmount();
      observedCursors?.mount(board);
    });

    expect(cursorEngine.unmount).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenCalledTimes(2);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(board);

    await harness.unmount();

    expect(cursorEngine.unmount).toHaveBeenCalledTimes(2);
  });

  it('rerenders when cursor snapshots change and skips deep-equal updates', async () => {
    const initialCursor = createCursor('cursor-peer', {
      tool: 'pen',
      metadata: {
        pressure: 0.5,
      },
    });
    const cursorEngine = createMockCursorEngine([initialCursor]);
    createMockRoom(
      'cursor-reactivity',
      {},
      {
        cursorEngine,
      },
    );
    const snapshots: Array<CursorPosition<CursorData>[]> = [];
    let renderCount = 0;

    function CursorConsumer(): ReactNode {
      const cursorState = useCursors();
      renderCount += 1;
      snapshots.push(cursorState.cursors);
      return createElement('div', {
        id: 'cursor-reactivity-board',
        ref: cursorState.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'cursor-reactivity',
        },
        createElement(CursorConsumer),
      ),
    );

    await act(async () => {
      cursorEngine.emit([
        createCursor('cursor-peer', {
          tool: 'pen',
          metadata: {
            pressure: 0.5,
          },
        }),
      ]);
    });
    await act(async () => {
      cursorEngine.emit([
        createCursor('cursor-peer', {
          x: 0.6,
          xAbsolute: 60,
          tool: 'pen',
          metadata: {
            pressure: 0.9,
          },
        }),
      ]);
    });

    expect(renderCount).toBe(2);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({
      x: 0.6,
      xAbsolute: 60,
      metadata: {
        pressure: 0.9,
      },
    });
    expect(cursorEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('preserves the cursor array reference across parent rerenders when unchanged', async () => {
    const cursorEngine = createMockCursorEngine([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    createMockRoom(
      'cursor-stability',
      {},
      {
        cursorEngine,
      },
    );
    const cursorArrays: Array<CursorPosition<CursorData>[]> = [];

    function CursorConsumer(): ReactNode {
      const cursorState = useCursors();
      cursorArrays.push(cursorState.cursors);
      return createElement('div', {
        id: 'cursor-stability-board',
        ref: cursorState.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'cursor-stability',
        },
        createElement(CursorConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'cursor-stability',
        },
        createElement(CursorConsumer),
      ),
    );

    expect(cursorArrays).toHaveLength(2);
    expect(cursorArrays[1]).toBe(cursorArrays[0]);
    expect(cursorEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('follows room replacement, resubscribes, and remounts the tracked element', async () => {
    const roomACursorEngine = createMockCursorEngine([
      createCursor('room-a-peer', {
        tool: 'pen',
      }),
    ]);
    const roomBCursorEngine = createMockCursorEngine([
      createCursor('room-b-peer', {
        tool: 'eraser',
      }),
    ]);
    createMockRoom(
      'cursor-room-a',
      {},
      {
        cursorEngine: roomACursorEngine,
      },
    );
    createMockRoom(
      'cursor-room-b',
      {},
      {
        cursorEngine: roomBCursorEngine,
      },
    );
    const snapshots: Array<CursorPosition<CursorData>[]> = [];

    function CursorConsumer(): ReactNode {
      const cursorState = useCursors();
      snapshots.push(cursorState.cursors);
      return createElement('div', {
        id: 'cursor-room-swap-board',
        ref: cursorState.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'cursor-room-a',
        },
        createElement(CursorConsumer),
      ),
    );
    const board = document.getElementById('cursor-room-swap-board') as HTMLElement;

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'cursor-room-b',
        },
        createElement(CursorConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomACursorEngine.emit([createCursor('room-a-other', { tool: 'pen' })]);
    });
    await act(async () => {
      roomBCursorEngine.emit([
        createCursor('room-b-other', {
          tool: 'eraser',
          metadata: {
            pressure: 0.4,
          },
        }),
      ]);
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots[1]).toEqual([
      createCursor('room-b-peer', {
        tool: 'eraser',
      }),
    ]);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]?.[0]).toMatchObject({
      userId: 'room-b-other',
      tool: 'eraser',
      metadata: {
        pressure: 0.4,
      },
    });
    expect(roomACursorEngine.subscriberCount()).toBe(0);
    expect(roomBCursorEngine.subscriberCount()).toBe(1);
    expect(roomACursorEngine.unmount).toHaveBeenCalled();
    expect(roomBCursorEngine.mount).toHaveBeenCalledWith(board);

    await harness.unmount();
  });

  it('throws a typed error when useCursors() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useCursors();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(FlockError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('FlockProvider');
  });
});

describe('useSharedState', () => {
  it('returns [value, setValue], forwards options, and supports direct and updater writes', async () => {
    const stateEngine = createMockStateEngine({
      count: 0,
      nested: {
        enabled: true,
      },
    });
    const room = createMockRoom(
      'shared-state-room',
      {},
      {
        stateEngine,
      },
    );
    let observedValue: {
      count: number;
      nested: {
        enabled: boolean;
      };
    } | null = null;
    let observedSetValue: Dispatch<
      SetStateAction<{
        count: number;
        nested: {
          enabled: boolean;
        };
      }>
    > | null = null;
    const setterReferences: Array<
      Dispatch<SetStateAction<{ count: number; nested: { enabled: boolean } }>>
    > = [];

    function SharedStateConsumer(): null {
      const [value, setValue] = useSharedState('shared-count', {
        initialValue: {
          count: 0,
          nested: {
            enabled: true,
          },
        },
        strategy: 'crdt',
        persist: false,
      });

      observedValue = value;
      observedSetValue = setValue;
      setterReferences.push(setValue);
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-room',
        },
        createElement(SharedStateConsumer),
      ),
    );

    expect(observedValue).toEqual({
      count: 0,
      nested: {
        enabled: true,
      },
    });
    expect(typeof observedSetValue).toBe('function');
    expect(room.useState.mock.calls[0]?.[0]).toEqual({
      initialValue: {
        count: 0,
        nested: {
          enabled: true,
        },
      },
      strategy: 'crdt',
      persist: false,
    });

    await act(async () => {
      observedSetValue?.({
        count: 3,
        nested: {
          enabled: false,
        },
      });
    });

    expect(stateEngine.set).toHaveBeenCalledWith({
      count: 3,
      nested: {
        enabled: false,
      },
    });

    await act(async () => {
      observedSetValue?.((previous) => {
        return {
          count: previous.count + 2,
          nested: previous.nested,
        };
      });
    });

    expect(stateEngine.set).toHaveBeenLastCalledWith({
      count: 5,
      nested: {
        enabled: false,
      },
    });

    const setCallCountBeforeNoop = stateEngine.set.mock.calls.length;
    await act(async () => {
      observedSetValue?.((previous) => {
        return {
          count: previous.count,
          nested: {
            enabled: previous.nested.enabled,
          },
        };
      });
    });

    expect(stateEngine.set).toHaveBeenCalledTimes(setCallCountBeforeNoop);

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-room',
        },
        createElement(SharedStateConsumer),
      ),
    );

    expect(setterReferences.length).toBeGreaterThanOrEqual(2);
    expect(
      setterReferences.every((setValueReference) => {
        return setValueReference === setterReferences[0];
      }),
    ).toBe(true);

    await harness.unmount();
  });

  it('rerenders on local or remote state changes and skips deep-equal snapshots', async () => {
    const stateEngine = createMockStateEngine({
      votes: {
        yes: 1,
        no: 0,
      },
    });
    createMockRoom(
      'shared-state-reactivity',
      {},
      {
        stateEngine,
      },
    );
    const snapshots: Array<{ votes: { yes: number; no: number } }> = [];
    let renderCount = 0;
    let observedSetValue: Dispatch<
      SetStateAction<{
        votes: {
          yes: number;
          no: number;
        };
      }>
    > | null = null;

    function SharedStateConsumer(): null {
      const [value, setValue] = useSharedState('poll-state', {
        initialValue: {
          votes: {
            yes: 1,
            no: 0,
          },
        },
      });

      renderCount += 1;
      snapshots.push(value);
      observedSetValue = setValue;
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-reactivity',
        },
        createElement(SharedStateConsumer),
      ),
    );

    await act(async () => {
      observedSetValue?.((previous) => {
        return {
          votes: {
            yes: previous.votes.yes + 1,
            no: previous.votes.no,
          },
        };
      });
    });

    await act(async () => {
      stateEngine.emit({
        votes: {
          yes: 2,
          no: 0,
        },
      });
    });

    await act(async () => {
      stateEngine.emit({
        votes: {
          yes: 2,
          no: 1,
        },
      });
    });

    expect(renderCount).toBe(3);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]).toEqual({
      votes: {
        yes: 2,
        no: 0,
      },
    });
    expect(snapshots[2]).toEqual({
      votes: {
        yes: 2,
        no: 1,
      },
    });

    await harness.unmount();
  });

  it('preserves the shared value reference across parent rerenders when unchanged', async () => {
    const stateEngine = createMockStateEngine({
      count: 1,
      meta: {
        owner: 'Ada',
      },
    });
    createMockRoom(
      'shared-state-stability',
      {},
      {
        stateEngine,
      },
    );
    const valueReferences: Array<{ count: number; meta: { owner: string } }> = [];

    function SharedStateConsumer(): null {
      const [value] = useSharedState('stable-state', {
        initialValue: {
          count: 1,
          meta: {
            owner: 'Ada',
          },
        },
      });

      valueReferences.push(value);
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-stability',
        },
        createElement(SharedStateConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-stability',
        },
        createElement(SharedStateConsumer),
      ),
    );

    expect(valueReferences).toHaveLength(2);
    expect(valueReferences[1]).toBe(valueReferences[0]);
    expect(stateEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('allows multiple consumers in the same room when key and options are compatible', async () => {
    const stateEngine = createMockStateEngine({
      score: 1,
    });
    createMockRoom(
      'shared-state-multi',
      {},
      {
        stateEngine,
      },
    );
    const firstSnapshots: Array<{ score: number }> = [];
    const secondSnapshots: Array<{ score: number }> = [];
    let firstSetValue: Dispatch<SetStateAction<{ score: number }>> | null = null;

    function FirstConsumer(): null {
      const [value, setValue] = useSharedState('game-state', {
        initialValue: {
          score: 1,
        },
        strategy: 'lww',
      });

      firstSnapshots.push(value);
      firstSetValue = setValue;
      return null;
    }

    function SecondConsumer(): null {
      const [value] = useSharedState('game-state', {
        initialValue: {
          score: 1,
        },
      });

      secondSnapshots.push(value);
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-multi',
        },
        createElement(FirstConsumer),
        createElement(SecondConsumer),
      ),
    );

    await act(async () => {
      firstSetValue?.({
        score: 2,
      });
    });

    expect(firstSnapshots).toEqual([{ score: 1 }, { score: 2 }]);
    expect(secondSnapshots).toEqual([{ score: 1 }, { score: 2 }]);

    await harness.unmount();
  });

  it('throws when the same room is bound to a different key', () => {
    createMockRoom('shared-state-key-mismatch');

    function FirstConsumer(): null {
      useSharedState('first-key', {
        initialValue: {
          count: 0,
        },
      });
      return null;
    }

    function SecondConsumer(): null {
      useSharedState('second-key', {
        initialValue: {
          count: 0,
        },
      });
      return null;
    }

    let thrownError: unknown = null;

    try {
      renderToString(
        createElement(
          FlockProvider,
          {
            roomId: 'shared-state-key-mismatch',
          },
          createElement(FirstConsumer),
          createElement(SecondConsumer),
        ),
      );
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(FlockError);
    expect((thrownError as Error).message).toContain('already bound to key');
  });

  it('throws when the same room receives incompatible shared state options', () => {
    createMockRoom('shared-state-option-mismatch');

    function InitialValueConsumer(): null {
      useSharedState('state-key', {
        initialValue: {
          count: 0,
        },
        strategy: 'lww',
      });
      return null;
    }

    function ConflictingInitialValueConsumer(): null {
      useSharedState('state-key', {
        initialValue: {
          count: 1,
        },
      });
      return null;
    }

    expect(() => {
      renderToString(
        createElement(
          FlockProvider,
          {
            roomId: 'shared-state-option-mismatch',
          },
          createElement(InitialValueConsumer),
          createElement(ConflictingInitialValueConsumer),
        ),
      );
    }).toThrow('different initialValue');

    createMockRoom('shared-state-persist-mismatch');

    function PersistentConsumer(): null {
      useSharedState('state-key', {
        initialValue: {
          count: 0,
        },
        persist: true,
      });
      return null;
    }

    function NonPersistentConsumer(): null {
      useSharedState('state-key', {
        initialValue: {
          count: 0,
        },
        persist: false,
      });
      return null;
    }

    expect(() => {
      renderToString(
        createElement(
          FlockProvider,
          {
            roomId: 'shared-state-persist-mismatch',
          },
          createElement(PersistentConsumer),
          createElement(NonPersistentConsumer),
        ),
      );
    }).toThrow('persistence is already enabled');
  });

  it('allows later persist: true upgrades for lww state in the same room', async () => {
    const stateEngine = createMockStateEngine({
      count: 0,
    });
    const room = createMockRoom(
      'shared-state-persist-upgrade',
      {},
      {
        stateEngine,
      },
    );

    function InitialConsumer(): null {
      useSharedState('persisted-state', {
        initialValue: {
          count: 0,
        },
      });
      return null;
    }

    function UpgradedConsumer(): null {
      useSharedState('persisted-state', {
        initialValue: {
          count: 0,
        },
        persist: true,
      });
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-persist-upgrade',
        },
        createElement(InitialConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-persist-upgrade',
        },
        createElement(InitialConsumer),
        createElement(UpgradedConsumer),
      ),
    );

    expect(room.useState.mock.calls).toHaveLength(3);

    await harness.unmount();
  });

  it('keeps setValue stable across room replacement and resubscribes to the new state engine', async () => {
    const roomAState = createMockStateEngine({
      count: 1,
    });
    const roomBState = createMockStateEngine({
      count: 10,
    });
    createMockRoom(
      'shared-state-room-a',
      {},
      {
        stateEngine: roomAState,
      },
    );
    createMockRoom(
      'shared-state-room-b',
      {},
      {
        stateEngine: roomBState,
      },
    );
    const snapshots: Array<{ count: number }> = [];
    const setters: Array<Dispatch<SetStateAction<{ count: number }>>> = [];

    function SharedStateConsumer(): null {
      const [value, setValue] = useSharedState('room-state', {
        initialValue: {
          count: 0,
        },
      });

      snapshots.push(value);
      setters.push(setValue);
      return null;
    }

    const harness = await renderElement(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-room-a',
        },
        createElement(SharedStateConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        FlockProvider,
        {
          roomId: 'shared-state-room-b',
        },
        createElement(SharedStateConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomAState.emit({
        count: 99,
      });
    });
    await act(async () => {
      roomBState.emit({
        count: 11,
      });
    });
    await act(async () => {
      setters[1]?.((previous) => {
        return {
          count: previous.count + 1,
        };
      });
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots).toEqual([{ count: 1 }, { count: 10 }, { count: 11 }, { count: 12 }]);
    expect(roomAState.subscriberCount()).toBe(0);
    expect(roomBState.subscriberCount()).toBe(1);
    expect(setters[1]).toBe(setters[0]);
    expect(roomAState.set).toHaveBeenCalledTimes(0);
    expect(roomBState.set).toHaveBeenCalledWith({
      count: 12,
    });

    await harness.unmount();
  });

  it('preserves state value and setter types', () => {
    function TypeConsumer(): null {
      const [value, setValue] = useSharedState('typed-state', {
        initialValue: {
          count: 0,
          label: 'Ada',
        },
      });

      expectTypeOf(value).toEqualTypeOf<{
        count: number;
        label: string;
      }>();
      expectTypeOf(setValue).toEqualTypeOf<
        Dispatch<
          SetStateAction<{
            count: number;
            label: string;
          }>
        >
      >();

      return null;
    }

    expect(TypeConsumer).toBeTypeOf('function');
  });

  it('throws a typed error when useSharedState() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useSharedState('outside-provider', {
        initialValue: {
          count: 0,
        },
      });
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(FlockError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('FlockProvider');
  });
});
