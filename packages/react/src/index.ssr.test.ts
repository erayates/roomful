// @vitest-environment node

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
  RoomOptions,
  RoomStatus,
  StateChangeMeta,
  StateEngine,
} from '@roomful/core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RoomfulProvider,
  useAwareness,
  type UseAwarenessResult,
  useConnectionStatus,
  useCursors,
  useEvent,
  usePeers,
  usePresence,
  type UsePresenceResult,
  useRoom,
  useSharedState,
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
type TestPresenceEngine = PresenceEngine<PresenceData> & {
  subscribe: ReturnType<typeof vi.fn<(cb: (peers: Peer<PresenceData>[]) => void) => () => void>>;
};

type TestCursorEngine = CursorEngine<CursorData> & {
  subscribe: ReturnType<
    typeof vi.fn<(cb: (positions: CursorPosition<CursorData>[]) => void) => () => void>
  >;
  getPositions: ReturnType<typeof vi.fn<() => CursorPosition<CursorData>[]>>;
};

type TestAwarenessEngine = AwarenessEngine & {
  subscribe: ReturnType<typeof vi.fn<(cb: (peers: AwarenessState[]) => void) => () => void>>;
};

type TestEventEngine = EventEngine<PresenceData> & {
  on: ReturnType<
    typeof vi.fn<
      (name: string, cb: (payload: unknown, from: Peer<PresenceData>) => void) => () => void
    >
  >;
};

type TestStateEngine<T> = StateEngine<T> & {
  subscribe: ReturnType<
    typeof vi.fn<(cb: (value: T, meta: StateChangeMeta) => void) => () => void>
  >;
  get: ReturnType<typeof vi.fn<() => T>>;
};

type TestRoom = Room<PresenceData> & {
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
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

function createMockPresenceEngine(
  selfPeerId: string,
  peers: Peer<PresenceData>[],
): TestPresenceEngine {
  const currentPeers = peers;

  return {
    update: vi.fn(),
    replace: vi.fn(),
    subscribe: vi.fn(() => {
      return () => {
        return undefined;
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
  } as TestPresenceEngine;
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

function createMockCursorEngine(positions: CursorPosition<CursorData>[] = []): TestCursorEngine {
  const currentPositions = positions;

  return {
    mount: vi.fn(),
    unmount: vi.fn(),
    render: vi.fn(),
    setPosition: vi.fn(),
    subscribe: vi.fn(() => {
      return () => {
        return undefined;
      };
    }),
    getPositions: vi.fn(() => {
      return currentPositions;
    }),
  } as TestCursorEngine;
}

function createMockAwarenessEngine(peers: AwarenessState[] = []): TestAwarenessEngine {
  const currentPeers = peers;

  return {
    set: vi.fn(),
    setTyping: vi.fn(),
    setFocus: vi.fn(),
    setSelection: vi.fn(),
    subscribe: vi.fn(() => {
      return () => {
        return undefined;
      };
    }),
    getAll() {
      return currentPeers;
    },
  } as TestAwarenessEngine;
}

function createMockEventEngine(): TestEventEngine {
  return {
    emit: vi.fn(),
    emitTo: vi.fn(),
    on: vi.fn(() => {
      return () => {
        return undefined;
      };
    }),
    off: vi.fn(),
  } as TestEventEngine;
}

function cloneTestValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return value;
}

function createMockStateEngine<T>(initialValue: T): TestStateEngine<T> {
  const currentValue = cloneTestValue(initialValue);

  return {
    get: vi.fn(() => {
      return cloneTestValue(currentValue);
    }),
    set: vi.fn(),
    patch: vi.fn(),
    undo: vi.fn(),
    reset: vi.fn(),
    subscribe: vi.fn(() => {
      return () => {
        return undefined;
      };
    }),
  } as TestStateEngine<T>;
}

function createMockRoom(
  roomId = 'server-room',
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
  const peerId = config.peerId ?? `${roomId}-peer`;
  const awarenessEngine = config.awarenessEngine ?? createMockAwarenessEngine();
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const eventEngine = config.eventEngine ?? createMockEventEngine();
  const stateEngine = config.stateEngine ?? createMockStateEngine({});
  const presenceEngine =
    config.presenceEngine ?? createMockPresenceEngine(peerId, [createPeer(peerId)]);
  const currentStatus = config.status ?? 'idle';
  const currentPeers = presenceEngine.getAll().filter((peer) => {
    return peer.id !== peerId;
  });

  const room = {
    id: roomId,
    peerId,
    status: currentStatus,
    peers: currentPeers,
    peerCount: currentPeers.length,
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
    useViewport: vi.fn(() => {
      return {
        mount: vi.fn(),
        unmount: vi.fn(),
        broadcast: vi.fn(),
        stopBroadcast: vi.fn(),
        present: vi.fn(),
        stopPresenting: vi.fn(),
        follow: vi.fn(),
        unfollow: vi.fn(),
        subscribe: vi.fn(() => {
          return () => {
            return undefined;
          };
        }),
        getAll: vi.fn(() => {
          return [];
        }),
        get: vi.fn(() => {
          return undefined;
        }),
      };
    }),
    useLocks: vi.fn(() => {
      return {
        acquire: vi.fn(async () => {
          return true;
        }),
        release: vi.fn(),
        releaseAll: vi.fn(),
        isLocked: vi.fn(() => {
          return false;
        }),
        getHolder: vi.fn(() => {
          return null;
        }),
        getAll: vi.fn(() => {
          return [];
        }),
        subscribe: vi.fn(() => {
          return () => {
            return undefined;
          };
        }),
        subscribeAll: vi.fn(() => {
          return () => {
            return undefined;
          };
        }),
      };
    }),
    useEvents: vi.fn(() => {
      return eventEngine;
    }),
    getYDoc: vi.fn(),
    getYProvider: vi.fn(),
    on: vi.fn(() => {
      return () => {
        return undefined;
      };
    }),
    off: vi.fn(),
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

beforeEach(() => {
  createRoomMock.mockReset();
});

describe('RoomfulProvider SSR', () => {
  it('renders on the server without connecting and still exposes the room to descendants', () => {
    const room = createMockRoom('server-room', {
      transport: 'broadcast',
    });
    let observedRoom: Room<PresenceData> | null = null;

    function RoomConsumer(): null {
      observedRoom = useRoom();
      return null;
    }

    const html = renderToString(
      createElement(
        RoomfulProvider,
        {
          roomId: 'server-room',
          transport: 'broadcast',
        },
        createElement(RoomConsumer),
      ),
    );

    expect(html).toBe('');
    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(observedRoom).toBe(room);
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
  });

  it('lets usePresence() read the initial snapshot during server render without subscribing', () => {
    const self = createPeer('server-presence-self', { name: 'Ada' });
    const other = createPeer('server-presence-other', { name: 'Grace' });
    const presenceEngine = createMockPresenceEngine('server-presence-self', [self, other]);
    const room = createMockRoom(
      'server-presence-room',
      {},
      {
        peerId: 'server-presence-self',
        presenceEngine,
      },
    );
    let observedPresence: UsePresenceResult<PresenceData> | null = null;

    function PresenceConsumer(): null {
      observedPresence = usePresence();
      return null;
    }

    const html = renderToString(
      createElement(
        RoomfulProvider,
        {
          roomId: 'server-presence-room',
        },
        createElement(PresenceConsumer),
      ),
    );

    expect(html).toBe('');
    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(observedPresence?.self).toEqual(self);
    expect(observedPresence?.others).toEqual([other]);
    expect(observedPresence?.all).toEqual([self, other]);
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(presenceEngine.subscribe).toHaveBeenCalledTimes(0);
  });

  it('lets useCursors() read the initial snapshot during server render without subscribing', () => {
    const cursorEngine = createMockCursorEngine([
      createCursor('server-cursor-peer', {
        tool: 'pen',
        metadata: {
          pressure: 0.7,
        },
      }),
    ]);
    const room = createMockRoom(
      'server-cursor-room',
      {},
      {
        cursorEngine,
      },
    );
    let observedCursors: ReturnType<typeof useCursors> | null = null;

    function CursorConsumer(): null {
      observedCursors = useCursors();
      return null;
    }

    const html = renderToString(
      createElement(
        RoomfulProvider,
        {
          roomId: 'server-cursor-room',
        },
        createElement(CursorConsumer),
      ),
    );

    expect(html).toBe('');
    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(observedCursors?.cursors).toEqual([
      createCursor('server-cursor-peer', {
        tool: 'pen',
        metadata: {
          pressure: 0.7,
        },
      }),
    ]);
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(cursorEngine.subscribe).toHaveBeenCalledTimes(0);
    expect(cursorEngine.mount.mock.calls).toHaveLength(0);
    expect(cursorEngine.unmount.mock.calls).toHaveLength(0);
  });

  it('lets useSharedState() read the initial snapshot during server render without subscribing', () => {
    const stateEngine = createMockStateEngine({
      votes: {
        yes: 2,
        no: 1,
      },
    });
    const room = createMockRoom(
      'server-shared-state-room',
      {},
      {
        stateEngine,
      },
    );
    let observedValue: {
      votes: {
        yes: number;
        no: number;
      };
    } | null = null;

    function SharedStateConsumer(): null {
      [observedValue] = useSharedState('server-poll-state', {
        initialValue: {
          votes: {
            yes: 2,
            no: 1,
          },
        },
      });
      return null;
    }

    const html = renderToString(
      createElement(
        RoomfulProvider,
        {
          roomId: 'server-shared-state-room',
        },
        createElement(SharedStateConsumer),
      ),
    );

    expect(html).toBe('');
    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(observedValue).toEqual({
      votes: {
        yes: 2,
        no: 1,
      },
    });
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(stateEngine.subscribe).toHaveBeenCalledTimes(0);
  });

  it('lets useAwareness() read the initial remote snapshot during server render without subscribing', () => {
    const awarenessEngine = createMockAwarenessEngine([
      createAwareness('server-awareness-self', {
        focus: 'self',
      }),
      createAwareness('server-awareness-other', {
        typing: true,
      }),
    ]);
    const room = createMockRoom(
      'server-awareness-room',
      {},
      {
        awarenessEngine,
        peerId: 'server-awareness-self',
      },
    );
    let observedAwareness: UseAwarenessResult | null = null;

    function AwarenessConsumer(): null {
      observedAwareness = useAwareness();
      return null;
    }

    const html = renderToString(
      createElement(
        RoomfulProvider,
        {
          roomId: 'server-awareness-room',
        },
        createElement(AwarenessConsumer),
      ),
    );

    expect(html).toBe('');
    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(observedAwareness?.others).toEqual([
      createAwareness('server-awareness-other', {
        typing: true,
      }),
    ]);
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(awarenessEngine.subscribe).toHaveBeenCalledTimes(0);
  });

  it('lets usePeers() read the initial peer snapshot during server render without subscribing', () => {
    const self = createPeer('server-peers-self', {
      name: 'Self',
    });
    const other = createPeer('server-peers-other', {
      name: 'Other',
    });
    const presenceEngine = createMockPresenceEngine('server-peers-self', [self, other]);
    const room = createMockRoom(
      'server-peers-room',
      {},
      {
        peerId: 'server-peers-self',
        presenceEngine,
      },
    );
    let observedPeers: Peer<PresenceData>[] | null = null;

    function PeersConsumer(): null {
      observedPeers = usePeers();
      return null;
    }

    const html = renderToString(
      createElement(
        RoomfulProvider,
        {
          roomId: 'server-peers-room',
        },
        createElement(PeersConsumer),
      ),
    );

    expect(html).toBe('');
    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(observedPeers).toEqual([other]);
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(presenceEngine.subscribe).toHaveBeenCalledTimes(0);
  });

  it('lets useConnectionStatus() read the initial status during server render without subscribing', () => {
    createMockRoom('server-status-room', {}, { status: 'connected' });
    let observedStatus: RoomStatus | null = null;

    function StatusConsumer(): null {
      observedStatus = useConnectionStatus();
      return null;
    }

    const html = renderToString(
      createElement(
        RoomfulProvider,
        {
          roomId: 'server-status-room',
        },
        createElement(StatusConsumer),
      ),
    );

    expect(html).toBe('');
    expect(observedStatus).toBe('connected');
  });

  it('lets useEvent() render on the server without registering listeners', () => {
    const eventEngine = createMockEventEngine();
    const room = createMockRoom(
      'server-event-room',
      {},
      {
        eventEngine,
      },
    );
    let observedEmit: ((payload: { text: string }) => void) | null = null;

    function EventConsumer(): null {
      observedEmit = useEvent<{ text: string }>('message', () => {
        return undefined;
      });
      return null;
    }

    const html = renderToString(
      createElement(
        RoomfulProvider,
        {
          roomId: 'server-event-room',
        },
        createElement(EventConsumer),
      ),
    );

    expect(html).toBe('');
    expect(typeof observedEmit).toBe('function');
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(eventEngine.on).toHaveBeenCalledTimes(0);
  });
});
