import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInitialStateSnapshot } from './internal/state';
import { getTransportProtocolCapabilities } from './transports/transport.protocol';
import type { TransportAdapter, TransportSignal } from './transports/transport';
import type { Room } from './types';

class MockTransportAdapter implements TransportAdapter {
  public readonly kind = 'webrtc' as const;

  private handler: ((signal: TransportSignal) => void) | null = null;

  public connect(): Promise<void> {
    return Promise.resolve();
  }

  public disconnect(): Promise<void> {
    return Promise.resolve();
  }

  public send(signal: TransportSignal): void {
    void signal;
  }

  public broadcast(signal: TransportSignal): void {
    void signal;
  }

  public onMessage(handler: (signal: TransportSignal) => void): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) {
        this.handler = null;
      }
    };
  }

  public emit(signal: TransportSignal): void {
    this.handler?.(signal);
  }
}

async function createMockedRoom(
  createAdapter: () => MockTransportAdapter,
  options: Record<string, unknown> = {},
): Promise<Room> {
  vi.resetModules();
  vi.doMock('./transports/select-transport', () => ({
    selectTransportAdapter: () => {
      return createAdapter();
    },
  }));

  const mod = await import('./index');
  return mod.createRoom('room-logging', {
    transport: 'webrtc',
    relayUrl: 'ws://relay.local',
    debug: true,
    ...options,
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('./transports/select-transport');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Room structured logging', () => {
  it('logs connect and disconnect lifecycle events', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {
      return undefined;
    });
    const adapter = new MockTransportAdapter();
    const room = await createMockedRoom(() => {
      return adapter;
    });

    await room.connect();
    await room.disconnect();

    expect(
      infoSpy.mock.calls.some(([message, payload]) => {
        return (
          message === '[FlockJS] transport: Transport connect attempt started' &&
          (payload as Record<string, unknown>).roomId === 'room-logging'
        );
      }),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(([message, payload]) => {
        return (
          message === '[FlockJS] transport: Transport connected' &&
          (payload as Record<string, unknown>).transport === 'webrtc'
        );
      }),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(([message, payload]) => {
        return (
          message === '[FlockJS] transport: Transport disconnected' &&
          (payload as Record<string, unknown>).reason === 'manual'
        );
      }),
    ).toBe(true);
  });

  it('logs reconnect lifecycle metadata', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {
      return undefined;
    });
    const initialAdapter = new MockTransportAdapter();
    const reconnectAdapter = new MockTransportAdapter();
    const adapters = [initialAdapter, reconnectAdapter];
    const room = await createMockedRoom(
      () => {
        const adapter = adapters.shift();
        if (!adapter) {
          throw new Error('Expected queued adapter.');
        }

        return adapter;
      },
      {
        reconnect: true,
      },
    );

    await room.connect();
    initialAdapter.emit({
      type: 'transport:disconnected',
      roomId: room.id,
      fromPeerId: room.peerId,
      payload: {
        reason: 'socket-gone',
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    expect(
      infoSpy.mock.calls.some(([message, payload]) => {
        return (
          message === '[FlockJS] transport: Reconnect loop started' &&
          (payload as Record<string, unknown>).reason === 'socket-gone'
        );
      }),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(([message, payload]) => {
        return (
          message === '[FlockJS] performance: Reconnect attempt scheduled' &&
          (payload as Record<string, unknown>).attempt === 1
        );
      }),
    ).toBe(true);

    await room.disconnect();
  });

  it('logs presence, state, and event activity', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {
      return undefined;
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      return undefined;
    });
    const adapter = new MockTransportAdapter();
    const room = await createMockedRoom(() => {
      return adapter;
    });
    const protocol = getTransportProtocolCapabilities('webrtc');

    await room.connect();

    room.usePresence().update({
      name: 'Ada',
    });
    adapter.emit({
      type: 'hello',
      roomId: room.id,
      fromPeerId: 'peer-b',
      timestamp: 1,
      payload: {
        peer: {
          id: 'peer-b',
          joinedAt: 1,
          lastSeen: 1,
          name: 'Grace',
        },
        protocol,
      },
    });

    const state = room.useState({
      initialValue: {
        count: 0,
      },
    });
    state.set({
      count: 1,
    });

    const remoteSnapshot = createInitialStateSnapshot(
      {
        count: 2,
      },
      'peer-b',
      Date.now() + 1_000,
    );
    adapter.emit({
      type: 'state:update',
      roomId: room.id,
      fromPeerId: 'peer-b',
      timestamp: remoteSnapshot.timestamp,
      payload: remoteSnapshot,
    });

    const events = room.useEvents();
    events.emit('ping', {
      ok: true,
    });
    adapter.emit({
      type: 'event',
      roomId: room.id,
      fromPeerId: 'peer-b',
      timestamp: Date.now() + 2_000,
      payload: {
        name: 'pong',
        payload: {
          ok: true,
        },
        loopback: false,
      },
    });

    expect(
      infoSpy.mock.calls.some(([message]) => {
        return message === '[FlockJS] presence: Local presence updated';
      }),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(([message]) => {
        return message === '[FlockJS] presence: Peer hello received';
      }),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(([message]) => {
        return message === '[FlockJS] state: Local state mutation applied';
      }),
    ).toBe(true);
    expect(
      [...infoSpy.mock.calls, ...warnSpy.mock.calls].some(([message]) => {
        return (
          message === '[FlockJS] state: Remote state snapshot accepted' ||
          message === '[FlockJS] state: Remote state snapshot ignored'
        );
      }),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(([message]) => {
        return message === '[FlockJS] events: Outbound event emitted';
      }),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(([message]) => {
        return message === '[FlockJS] events: Inbound event delivered';
      }),
    ).toBe(true);

    await room.disconnect();
  });
});
