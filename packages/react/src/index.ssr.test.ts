// @vitest-environment node

import type { PresenceData, Room, RoomOptions } from '@flockjs/core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { FlockProvider, useRoom } from './index';

type TestRoom = Room<PresenceData> & {
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
};

function createMockRoom(
  roomId = 'server-room',
  options: RoomOptions<PresenceData> = {},
): TestRoom {
  const room = {
    id: roomId,
    peerId: `${roomId}-peer`,
    status: 'idle',
    peers: [],
    peerCount: 0,
    connect: vi.fn(async () => {
      return undefined;
    }),
    disconnect: vi.fn(async () => {
      return undefined;
    }),
    usePresence: vi.fn(),
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
  } as TestRoom;

  createRoomMock.mockImplementationOnce((nextRoomId: string, nextOptions: RoomOptions<PresenceData>) => {
    expect(nextRoomId).toBe(roomId);
    expect(nextOptions).toEqual(expect.objectContaining(options));
    return room;
  });

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
});
