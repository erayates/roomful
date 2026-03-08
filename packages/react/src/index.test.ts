// @vitest-environment jsdom

import type { PresenceData, Room, RoomEventMap, RoomEventName, RoomOptions } from '@flockjs/core';
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

import { createReactHealth, FlockProvider, useRoom } from './index';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

type RoomEventPayload = RoomEventMap<PresenceData>[RoomEventName];
type RoomEventHandler = (payload: RoomEventPayload) => void;

interface RenderHarness {
  rerender(element: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}

type TestRoom = Room<PresenceData> & {
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  emit: <TEvent extends RoomEventName>(
    event: TEvent,
    payload: RoomEventMap<PresenceData>[TEvent],
  ) => void;
};

function createMockRoom(roomId = 'room-1', options: RoomOptions<PresenceData> = {}): TestRoom {
  const handlers = new Map<RoomEventName, Set<RoomEventHandler>>();

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
