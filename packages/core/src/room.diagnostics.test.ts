import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoomfulError } from './roomful-error';
import type { TransportAdapter, TransportSignal } from './transports/transport';
import { getTransportProtocolCapabilities } from './transports/transport.protocol';
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
  return mod.createRoom('room-diagnostics', {
    transport: 'webrtc',
    relayUrl: 'ws://relay.local',
    debug: {
      transport: true,
      state: false,
      presence: true,
      events: false,
      performance: true,
    },
    ...options,
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('./transports/select-transport');
  vi.restoreAllMocks();
});

describe('Room diagnostics', () => {
  it('returns the expected snapshot before connect', async () => {
    const adapter = new MockTransportAdapter();
    const room = await createMockedRoom(() => {
      return adapter;
    });
    const diagnostics = await room.getDiagnostics();

    expect(diagnostics).toMatchObject({
      roomId: 'room-diagnostics',
      status: 'idle',
      transport: {
        current: null,
        lastDisconnectReason: null,
        reconnectAttempt: 0,
      },
      debug: {
        transport: true,
        state: false,
        presence: true,
        events: false,
        performance: true,
        productionInfoSuppressed: false,
      },
      peers: {
        remoteCount: 0,
        remotePeerIds: [],
      },
      presence: {
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
      locks: {
        heldCount: 0,
        heldKeys: [],
      },
      comments: {
        threadCount: 0,
        openCount: 0,
      },
    });
    expect(diagnostics.timestamp).toEqual(expect.any(Number));
    expect(diagnostics.peerId).toEqual(expect.any(String));
    expect(diagnostics.presence.selfLastSeen).toEqual(expect.any(Number));
  });

  it('reports lock and comment diagnostics from the engines when used', async () => {
    const adapter = new MockTransportAdapter();
    const room = await createMockedRoom(() => {
      return adapter;
    });

    const locks = room.useLocks();
    await locks.acquire('cell-1');
    await locks.acquire('cell-2');

    const comments = room.useComments();
    const thread = await comments.add({ anchor: { elementId: 'doc' }, text: 'first' });
    await comments.add({ anchor: { elementId: 'doc' }, text: 'second' });
    await comments.thread(thread.id).resolve();

    const diagnostics = await room.getDiagnostics();
    expect(diagnostics.locks).toEqual({ heldCount: 2, heldKeys: ['cell-1', 'cell-2'] });
    expect(diagnostics.comments).toEqual({ threadCount: 2, openCount: 1 }); // one resolved
  });

  it('returns connected state diagnostics with peers, state, and event registrations', async () => {
    const adapter = new MockTransportAdapter();
    const room = await createMockedRoom(() => {
      return adapter;
    });
    const protocol = getTransportProtocolCapabilities('webrtc');

    await room.connect();
    room.useState({
      initialValue: {
        count: 0,
      },
    });
    const unsubscribe = room.useEvents().on('ping', () => {
      return undefined;
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
        },
        protocol,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    const diagnostics = await room.getDiagnostics();

    expect(diagnostics.status).toBe('connected');
    expect(diagnostics.transport.current).toBe('webrtc');
    expect(diagnostics.peers).toEqual({
      remoteCount: 1,
      remotePeerIds: ['peer-b'],
    });
    expect(diagnostics.presence.heartbeatActive).toBe(true);
    expect(diagnostics.state).toMatchObject({
      configured: true,
      strategy: 'lww',
      persistenceEnabled: false,
    });
    expect(diagnostics.state.stateSizeBytes).toBeGreaterThan(0);
    expect(diagnostics.events.registeredEventNames).toEqual(['ping']);
    expect(diagnostics.events.latestConnectDurationMs).toEqual(expect.any(Number));

    unsubscribe();
    await room.disconnect();
  });

  it('reports queued offline state and event counters after disconnect', async () => {
    const adapter = new MockTransportAdapter();
    const room = await createMockedRoom(() => {
      return adapter;
    });

    await room.connect();

    const state = room.useState({
      initialValue: {
        count: 0,
      },
    });
    const events = room.useEvents();

    adapter.emit({
      type: 'transport:disconnected',
      roomId: room.id,
      fromPeerId: room.peerId,
      payload: {
        reason: 'socket-gone',
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    state.set({
      count: 1,
    });
    events.emit('queued', {
      ok: true,
    });

    const diagnostics = await room.getDiagnostics();

    expect(diagnostics.status).toBe('disconnected');
    expect(diagnostics.transport).toEqual({
      current: null,
      lastDisconnectReason: 'socket-gone',
      reconnectAttempt: 0,
    });
    expect(diagnostics.state).toMatchObject({
      configured: true,
      queuedMutationCount: 1,
      offlineReplayInProgress: false,
    });
    expect(diagnostics.events).toMatchObject({
      messagesSent: 1,
      broadcastsSent: 1,
      directSends: 0,
    });
  });

  it('reports encryption incompatibility diagnostics without remote calls', async () => {
    const adapter = new MockTransportAdapter();
    const room = await createMockedRoom(
      () => {
        return adapter;
      },
      {
        encryption: {
          passphrase: 'room-secret',
        },
      },
    );
    const protocol = getTransportProtocolCapabilities('webrtc');

    await room.connect();
    const encryptionError = new Promise<RoomfulError>((resolve) => {
      const unsubscribe = room.on('error', (error) => {
        if (error.code === 'ENCRYPTION_ERROR') {
          unsubscribe();
          resolve(error);
        }
      });
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
        },
        protocol,
      },
    });
    await encryptionError;

    const diagnostics = await room.getDiagnostics();

    expect(diagnostics.encryption.enabled).toBe(true);
    expect(diagnostics.encryption.incompatiblePeerIds).toEqual(['peer-b']);
    expect(diagnostics.encryption.decryptionErrorPeerIds).toEqual([]);

    await room.disconnect();
  });

  it('reports network throughput and per-peer latency', async () => {
    const adapter = new MockTransportAdapter();
    const room = await createMockedRoom(() => {
      return adapter;
    });
    const protocol = getTransportProtocolCapabilities('webrtc');

    await room.connect();
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
        },
        protocol,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    // Simulate the diagnostic pong that answers the ping sent on peer join.
    adapter.emit({
      type: 'event',
      roomId: room.id,
      fromPeerId: 'peer-b',
      timestamp: 2,
      payload: {
        name: '__roomful:diag:pong__',
        payload: {
          sentAt: Date.now() - 12,
        },
      },
    });
    await Promise.resolve();

    const diagnostics = await room.getDiagnostics();

    expect(diagnostics.network.messagesPerSecond).toBeGreaterThan(0);
    expect(diagnostics.network.latency['peer-b']).toBeGreaterThanOrEqual(0);
    expect(diagnostics.network.latency['peer-b']).toBeLessThan(60_000);

    await room.disconnect();
  });
});
