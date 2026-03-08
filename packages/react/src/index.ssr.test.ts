// @vitest-environment node

import type {
  CursorData,
  CursorEngine,
  CursorPosition,
  Peer,
  PresenceData,
  PresenceEngine,
  Room,
  RoomOptions,
  StateChangeMeta,
  StateEngine,
} from '@flockjs/core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FlockProvider,
  useCursors,
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

vi.mock('@flockjs/core', async () => {
  const actual = await vi.importActual<typeof import('@flockjs/core')>('@flockjs/core');

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

type TestStateEngine<T> = StateEngine<T> & {
  subscribe: ReturnType<
    typeof vi.fn<(cb: (value: T, meta: StateChangeMeta) => void) => () => void>
  >;
  get: ReturnType<typeof vi.fn<() => T>>;
};

type TestRoom = Room<PresenceData> & {
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  cursorEngine: TestCursorEngine;
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
    cursorEngine?: TestCursorEngine;
    peerId?: string;
    presenceEngine?: TestPresenceEngine;
    stateEngine?: TestStateEngine<unknown>;
  } = {},
): TestRoom {
  const peerId = config.peerId ?? `${roomId}-peer`;
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const stateEngine = config.stateEngine ?? createMockStateEngine({});
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
    useState: vi.fn(() => {
      return stateEngine;
    }),
    useAwareness: vi.fn(),
    useEvents: vi.fn(),
    getYDoc: vi.fn(),
    getYProvider: vi.fn(),
    on: vi.fn(() => {
      return () => {
        return undefined;
      };
    }),
    off: vi.fn(),
    cursorEngine,
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

describe('FlockProvider SSR', () => {
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
        FlockProvider,
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
        FlockProvider,
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
        FlockProvider,
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
        FlockProvider,
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
});
