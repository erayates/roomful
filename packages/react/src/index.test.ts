// @vitest-environment jsdom

import type {
  CursorData,
  CursorEngine,
  CursorPosition,
  Peer,
  PresenceData,
  PresenceEngine,
  Room,
  RoomEventMap,
  RoomEventName,
  RoomOptions,
} from '@flockjs/core';
import { FlockError } from '@flockjs/core';
import type { ReactNode } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import type { UseCursorsResult, UsePresenceResult } from './index';
import { createReactHealth, FlockProvider, useCursors, usePresence, useRoom } from './index';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

type RoomEventPayload = RoomEventMap<PresenceData>[RoomEventName];
type RoomEventHandler = (payload: RoomEventPayload) => void;
type CursorSubscriber = (positions: CursorPosition<CursorData>[]) => void;
type PresenceSubscriber = (peers: Peer<PresenceData>[]) => void;

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
  setPosition: ReturnType<
    typeof vi.fn<(position: Partial<CursorPosition<CursorData>>) => void>
  >;
};

type TestRoom = Room<PresenceData> & {
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  emit: <TEvent extends RoomEventName>(
    event: TEvent,
    payload: RoomEventMap<PresenceData>[TEvent],
  ) => void;
  cursorEngine: TestCursorEngine;
  presenceEngine: TestPresenceEngine;
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

function createMockCursorEngine(
  positions: CursorPosition<CursorData>[] = [],
): TestCursorEngine {
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

function createMockRoom(
  roomId = 'room-1',
  options: RoomOptions<PresenceData> = {},
  config: {
    cursorEngine?: TestCursorEngine;
    peerId?: string;
    presenceEngine?: TestPresenceEngine;
  } = {},
): TestRoom {
  const handlers = new Map<RoomEventName, Set<RoomEventHandler>>();
  const peerId = config.peerId ?? `${roomId}-peer`;
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const presenceEngine =
    config.presenceEngine ?? createMockPresenceEngine(peerId, [createPeer(peerId)]);

  const room = {
    id: roomId,
    peerId,
    status: 'idle',
    peers: [],
    peerCount: 0,
    connect: vi.fn(async () => {
      return undefined;
    }),
    disconnect: vi.fn(async () => {
      return undefined;
    }),
    usePresence: vi.fn(() => {
      return presenceEngine;
    }),
    useCursors: vi.fn(() => {
      return cursorEngine;
    }),
    useState: vi.fn(),
    useAwareness: vi.fn(),
    useEvents: vi.fn(),
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
      for (const handler of handlers.get(event) ?? []) {
        handler(payload);
      }
    },
    cursorEngine,
    presenceEngine,
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
