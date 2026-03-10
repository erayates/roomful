import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInitialStateSnapshot, setStateSnapshot } from './internal/state';
import type { TransportAdapter, TransportSignal } from './transports/transport';
import type { Room, RoomOptions, StateChangeMeta } from './types';

class ControlledTransportAdapter implements TransportAdapter {
  public readonly kind = 'websocket' as const;

  public readonly sentSignals: TransportSignal[] = [];

  public readonly broadcastSignals: TransportSignal[] = [];

  private handler: ((signal: TransportSignal) => void) | null = null;

  public async connect(): Promise<void> {
    return undefined;
  }

  public async disconnect(): Promise<void> {
    return undefined;
  }

  public send(signal: TransportSignal): void {
    this.sentSignals.push(signal);
  }

  public broadcast(signal: TransportSignal): void {
    this.broadcastSignals.push(signal);
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

type AdapterFactory = () => ControlledTransportAdapter;

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function createOfflineRoom<TPresence extends Record<string, unknown>>(
  adapterFactory: AdapterFactory,
  options: RoomOptions<TPresence>,
): Promise<Room<TPresence>> {
  vi.resetModules();
  vi.doMock('./transports/select-transport', () => ({
    selectTransportAdapter: () => {
      return adapterFactory();
    },
  }));

  const mod = await import('./index');
  return mod.createRoom<TPresence>('room-offline-queue', options);
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  vi.doUnmock('./transports/select-transport');
  vi.restoreAllMocks();
  vi.useRealTimers();
  await flushMicrotasks();
});

describe('Room offline queue', () => {
  it('replays queued state mutations and events in order after reconnect', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const initialAdapter = new ControlledTransportAdapter();
    const reconnectAdapter = new ControlledTransportAdapter();
    const adapters = [initialAdapter, reconnectAdapter];

    const room = await createOfflineRoom<{ name: string }>(
      () => {
        const adapter = adapters.shift();
        if (!adapter) {
          throw new Error('Expected queued adapter.');
        }

        return adapter;
      },
      {
        transport: 'websocket',
        relayUrl: 'ws://relay.local',
        reconnect: true,
        presence: {
          name: 'Alice',
        },
      },
    );

    const state = room.useState({
      initialValue: {
        count: 0,
        flag: false,
      },
    });
    const events = room.useEvents();

    await room.connect();

    initialAdapter.emit({
      type: 'transport:disconnected',
      roomId: room.id,
      fromPeerId: room.peerId,
      payload: {
        reason: 'socket-gone',
      },
    });

    await flushMicrotasks();

    state.patch({
      count: 1,
    });
    events.emit('message', {
      step: 'middle',
    });
    state.patch({
      flag: true,
    });

    const reconnectPromise = room.connect();
    await vi.advanceTimersByTimeAsync(100);
    await reconnectPromise;

    await vi.advanceTimersByTimeAsync(20);
    await flushMicrotasks();

    const replayedTypes = reconnectAdapter.broadcastSignals.map((signal) => signal.type);
    expect(replayedTypes).toContain('hello');
    expect(replayedTypes.slice(1)).toEqual(['state:update', 'event', 'state:update']);
    expect(reconnectAdapter.broadcastSignals[1]).toMatchObject({
      type: 'state:update',
      payload: {
        value: {
          count: 1,
          flag: false,
        },
      },
    });
    expect(reconnectAdapter.broadcastSignals[2]).toMatchObject({
      type: 'event',
      payload: {
        name: 'message',
        payload: {
          step: 'middle',
        },
      },
    });
    expect(reconnectAdapter.broadcastSignals[3]).toMatchObject({
      type: 'state:update',
      payload: {
        value: {
          count: 1,
          flag: true,
        },
      },
    });
  });

  it('replays queued patch mutations on top of the latest remote snapshot', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const initialAdapter = new ControlledTransportAdapter();
    const reconnectAdapter = new ControlledTransportAdapter();
    const adapters = [initialAdapter, reconnectAdapter];

    const room = await createOfflineRoom<{ name: string }>(
      () => {
        const adapter = adapters.shift();
        if (!adapter) {
          throw new Error('Expected queued adapter.');
        }

        return adapter;
      },
      {
        transport: 'websocket',
        relayUrl: 'ws://relay.local',
        reconnect: true,
      },
    );

    const state = room.useState({
      initialValue: {
        flags: {
          local: false,
          remote: false,
        },
      },
    });

    await room.connect();

    initialAdapter.emit({
      type: 'transport:disconnected',
      roomId: room.id,
      fromPeerId: room.peerId,
      payload: {
        reason: 'socket-gone',
      },
    });

    await flushMicrotasks();

    state.patch({
      flags: {
        local: true,
      },
    });

    const reconnectPromise = room.connect();
    await vi.advanceTimersByTimeAsync(100);
    await reconnectPromise;

    const remoteBase = createInitialStateSnapshot(
      {
        flags: {
          local: false,
          remote: false,
        },
      },
      room.peerId,
      1,
    );
    const remoteSnapshot = setStateSnapshot(
      remoteBase,
      {
        flags: {
          local: false,
          remote: true,
        },
      },
      'peer-b',
      20,
    );

    reconnectAdapter.emit({
      type: 'state:update',
      roomId: room.id,
      fromPeerId: 'peer-b',
      timestamp: 20,
      payload: remoteSnapshot,
    });

    await vi.advanceTimersByTimeAsync(20);
    await flushMicrotasks();

    expect(state.get()).toEqual({
      flags: {
        local: true,
        remote: true,
      },
    });
  });

  it('emits offline once on unexpected disconnect and online after queue replay completes', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const initialAdapter = new ControlledTransportAdapter();
    const reconnectAdapter = new ControlledTransportAdapter();
    const adapters = [initialAdapter, reconnectAdapter];

    const room = await createOfflineRoom(
      () => {
        const adapter = adapters.shift();
        if (!adapter) {
          throw new Error('Expected queued adapter.');
        }

        return adapter;
      },
      {
        transport: 'websocket',
        relayUrl: 'ws://relay.local',
        reconnect: true,
      },
    );

    const offlineEvents: Array<{ reason?: string }> = [];
    const onlineEvents: Array<undefined> = [];
    room.on('offline', (payload) => {
      offlineEvents.push(payload);
    });
    room.on('online', () => {
      onlineEvents.push(undefined);
    });

    room.useState({
      initialValue: {
        count: 0,
      },
    }).set({
      count: 1,
    });

    await room.connect();

    initialAdapter.emit({
      type: 'transport:disconnected',
      roomId: room.id,
      fromPeerId: room.peerId,
      payload: {
        reason: 'socket-gone',
      },
    });

    await flushMicrotasks();

    room.useEvents().emit('message', {
      queued: true,
    });

    const reconnectPromise = room.connect();
    await vi.advanceTimersByTimeAsync(100);
    await reconnectPromise;
    await vi.advanceTimersByTimeAsync(20);
    await flushMicrotasks();

    expect(offlineEvents).toEqual([
      {
        reason: 'socket-gone',
      },
    ]);
    expect(onlineEvents).toHaveLength(1);
  });

  it('exposes queued mutation metadata while offline and clears it after replay', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const initialAdapter = new ControlledTransportAdapter();
    const reconnectAdapter = new ControlledTransportAdapter();
    const adapters = [initialAdapter, reconnectAdapter];

    const room = await createOfflineRoom(
      () => {
        const adapter = adapters.shift();
        if (!adapter) {
          throw new Error('Expected queued adapter.');
        }

        return adapter;
      },
      {
        transport: 'websocket',
        relayUrl: 'ws://relay.local',
        reconnect: true,
      },
    );

    const state = room.useState({
      initialValue: {
        count: 0,
      },
    });
    const metas: StateChangeMeta[] = [];
    state.subscribe((_value, meta) => {
      metas.push(meta);
    });

    await room.connect();

    initialAdapter.emit({
      type: 'transport:disconnected',
      roomId: room.id,
      fromPeerId: room.peerId,
      payload: {
        reason: 'socket-gone',
      },
    });

    await flushMicrotasks();

    state.set({
      count: 1,
    });

    expect(metas.at(-1)).toMatchObject({
      pending: true,
      queuedMutationCount: 1,
    });

    const reconnectPromise = room.connect();
    await vi.advanceTimersByTimeAsync(100);
    await reconnectPromise;
    await vi.advanceTimersByTimeAsync(20);
    await flushMicrotasks();

    expect(metas.at(-1)).toMatchObject({
      pending: false,
      queuedMutationCount: 0,
    });
  });
});
