import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFlockError } from './flock-error';
import type { TransportAdapter, TransportSignal } from './transports/transport';

class MockTransportAdapter implements TransportAdapter {
  public disconnectCalls = 0;

  private handler: ((signal: TransportSignal) => void) | null = null;

  public constructor(
    public readonly kind: TransportAdapter['kind'],
    private readonly connectBehavior: () => Promise<void> = async () => {
      return undefined;
    },
  ) {}

  public async connect(): Promise<void> {
    await this.connectBehavior();
  }

  public async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
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

afterEach(() => {
  vi.doUnmock('./transports/select-transport');
  vi.doUnmock('./transports/polling');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function createRoomWithFallbackMocks(options: {
  selectTransportAdapter: () => MockTransportAdapter;
  createPollingTransportAdapter: () => MockTransportAdapter;
  reconnect?: boolean;
}) {
  vi.resetModules();
  const selectTransportAdapter = vi.fn(() => {
    return options.selectTransportAdapter();
  });
  const createPollingTransportAdapter = vi.fn(() => {
    return options.createPollingTransportAdapter();
  });

  vi.doMock('./transports/select-transport', () => ({
    selectTransportAdapter,
    shouldSelectWebSocketTransport: () => true,
  }));
  vi.doMock('./transports/polling', () => ({
    createPollingTransportAdapter,
  }));

  const mod = await import('./index');
  return {
    room: mod.createRoom('room-websocket-fallback', {
      transport: 'websocket',
      relayUrl: 'ws://relay.local',
      websocket: {
        fallbackTransport: 'polling',
      },
      ...(options.reconnect !== undefined ? { reconnect: options.reconnect } : {}),
    }),
    selectTransportAdapter,
    createPollingTransportAdapter,
  };
}

describe('Room websocket polling fallback', () => {
  it('sticks to polling across auto-reconnect after initial websocket fallback', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const failingWebSocket = new MockTransportAdapter('websocket', async () => {
      throw createFlockError('NETWORK_ERROR', 'blocked', false, {
        source: 'websocket-relay',
        kind: 'connect-failed',
      });
    });
    const initialPolling = new MockTransportAdapter('polling');
    const reconnectPolling = new MockTransportAdapter('polling');
    const pollingAdapters = [initialPolling, reconnectPolling];

    const { room, selectTransportAdapter, createPollingTransportAdapter } =
      await createRoomWithFallbackMocks({
        selectTransportAdapter: () => failingWebSocket,
        createPollingTransportAdapter: () => {
          const adapter = pollingAdapters.shift();
          if (!adapter) {
            throw new Error('Expected queued polling adapter.');
          }

          return adapter;
        },
        reconnect: true,
      });

    await room.connect();
    expect(room.status).toBe('connected');
    expect(selectTransportAdapter).toHaveBeenCalledTimes(1);
    expect(createPollingTransportAdapter).toHaveBeenCalledTimes(1);

    initialPolling.emit({
      type: 'transport:disconnected',
      roomId: room.id,
      fromPeerId: room.peerId,
      payload: {
        reason: 'polling-lost',
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    expect(room.status).toBe('connected');
    expect(selectTransportAdapter).toHaveBeenCalledTimes(1);
    expect(createPollingTransportAdapter).toHaveBeenCalledTimes(2);

    await room.disconnect();
  });

  it('resets sticky polling fallback after manual disconnect', async () => {
    const failingWebSocket = new MockTransportAdapter('websocket', async () => {
      throw createFlockError('NETWORK_ERROR', 'blocked', false, {
        source: 'websocket-relay',
        kind: 'connect-failed',
      });
    });
    const successfulWebSocket = new MockTransportAdapter('websocket');
    const websocketAdapters = [failingWebSocket, successfulWebSocket];
    const initialPolling = new MockTransportAdapter('polling');

    const { room, selectTransportAdapter, createPollingTransportAdapter } =
      await createRoomWithFallbackMocks({
        selectTransportAdapter: () => {
          const adapter = websocketAdapters.shift();
          if (!adapter) {
            throw new Error('Expected queued websocket adapter.');
          }

          return adapter;
        },
        createPollingTransportAdapter: () => initialPolling,
      });

    await room.connect();
    expect(room.status).toBe('connected');
    expect(selectTransportAdapter).toHaveBeenCalledTimes(1);
    expect(createPollingTransportAdapter).toHaveBeenCalledTimes(1);

    await room.disconnect();
    await room.connect();

    expect(room.status).toBe('connected');
    expect(selectTransportAdapter).toHaveBeenCalledTimes(2);
    expect(createPollingTransportAdapter).toHaveBeenCalledTimes(1);

    await room.disconnect();
  });
});
