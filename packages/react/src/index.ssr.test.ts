// @vitest-environment node

import type { Peer, PresenceData, PresenceEngine, Room, RoomOptions } from '@flockjs/core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlockProvider, usePresence, type UsePresenceResult, useRoom } from './index';

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

type TestRoom = Room<PresenceData> & {
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  presenceEngine: TestPresenceEngine;
};

function createPeer(
  id: string,
  overrides: Partial<Peer<PresenceData>> = {},
): Peer<PresenceData> {
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
      return currentPeers.find((peer) => {
        return peer.id === peerId;
      }) ?? null;
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

function createMockRoom(
  roomId = 'server-room',
  options: RoomOptions<PresenceData> = {},
  config: {
    peerId?: string;
    presenceEngine?: TestPresenceEngine;
  } = {},
): TestRoom {
  const peerId = config.peerId ?? `${roomId}-peer`;
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
    useCursors: vi.fn(),
    useState: vi.fn(),
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
    const room = createMockRoom('server-presence-room', {}, {
      peerId: 'server-presence-self',
      presenceEngine,
    });
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
});
