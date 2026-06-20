import { vi } from 'vitest';

import type { Room, RoomOptions, PresenceData } from '../src/types';
import type { TransportAdapter, TransportSignal } from '../src/transports/transport';

type RoomIdentity = Pick<Room, 'id' | 'peerId'>;
type CreateRoomFn = typeof import('../src/index').createRoom;

function cloneSignal<TSignal extends TransportSignal>(signal: TSignal): TSignal {
  if (typeof structuredClone === 'function') {
    return structuredClone(signal);
  }

  return signal;
}

function createRoomKey(roomId: string, peerId: string): string {
  return `${roomId}:${peerId}`;
}

class MockTransportAdapter implements TransportAdapter {
  public readonly kind = 'websocket' as const;

  public readonly sentSignals: TransportSignal[] = [];

  public readonly broadcastSignals: TransportSignal[] = [];

  private connected = false;

  private messageHandler: ((signal: TransportSignal) => void) | null = null;

  public constructor(
    public readonly roomId: string,
    public readonly peerId: string,
    private readonly network: MockTransportNetwork,
  ) {}

  public async connect(): Promise<void> {
    this.connected = true;
    this.network.register(this);
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.network.unregister(this);
  }

  public send(signal: TransportSignal): void {
    this.sentSignals.push(signal);
    this.network.route(this, signal);
  }

  public broadcast(signal: TransportSignal): void {
    this.broadcastSignals.push(signal);
    this.network.route(this, signal);
  }

  public onMessage(handler: (signal: TransportSignal) => void): () => void {
    this.messageHandler = handler;
    return () => {
      if (this.messageHandler === handler) {
        this.messageHandler = null;
      }
    };
  }

  public emit(signal: TransportSignal): void {
    this.messageHandler?.(signal);
  }

  public isConnected(): boolean {
    return this.connected;
  }
}

class MockTransportNetwork {
  private readonly latestAdapters = new Map<string, MockTransportAdapter>();

  private readonly connectedAdapters = new Map<string, MockTransportAdapter>();

  public createAdapter(roomId: string, peerId: string): MockTransportAdapter {
    const adapter = new MockTransportAdapter(roomId, peerId, this);
    this.latestAdapters.set(createRoomKey(roomId, peerId), adapter);
    return adapter;
  }

  public register(adapter: MockTransportAdapter): void {
    this.connectedAdapters.set(createRoomKey(adapter.roomId, adapter.peerId), adapter);
  }

  public unregister(adapter: MockTransportAdapter): void {
    const key = createRoomKey(adapter.roomId, adapter.peerId);
    if (this.connectedAdapters.get(key) === adapter) {
      this.connectedAdapters.delete(key);
    }
  }

  public getAdapter(roomId: string, peerId: string): MockTransportAdapter | null {
    return this.latestAdapters.get(createRoomKey(roomId, peerId)) ?? null;
  }

  public emit(roomId: string, peerId: string, signal: TransportSignal): void {
    this.getAdapter(roomId, peerId)?.emit(signal);
  }

  public forceDisconnect(
    roomId: string,
    peerId: string,
    reason = 'mock-transport-disconnected',
  ): void {
    const adapter = this.getAdapter(roomId, peerId);
    if (!adapter) {
      throw new Error(`Missing mock transport adapter for ${roomId}/${peerId}.`);
    }

    this.unregister(adapter);
    queueMicrotask(() => {
      adapter.emit({
        type: 'transport:disconnected',
        roomId,
        fromPeerId: peerId,
        payload: { reason },
      });
    });
  }

  public clear(): void {
    this.connectedAdapters.clear();
    this.latestAdapters.clear();
  }

  public route(sender: MockTransportAdapter, signal: TransportSignal): void {
    if ('toPeerId' in signal && typeof signal.toPeerId === 'string') {
      const target = this.connectedAdapters.get(createRoomKey(sender.roomId, signal.toPeerId));
      if (target) {
        this.deliver(target, signal);
      }
      return;
    }

    for (const target of this.connectedAdapters.values()) {
      if (target.roomId !== sender.roomId || target.peerId === sender.peerId) {
        continue;
      }

      this.deliver(target, signal);
    }
  }

  private deliver(target: MockTransportAdapter, signal: TransportSignal): void {
    queueMicrotask(() => {
      if (!target.isConnected()) {
        return;
      }

      target.emit(cloneSignal(signal));
    });
  }
}

export interface MockRoomHarness {
  createRoom<TPresence extends PresenceData = PresenceData>(
    roomId: string,
    options?: Omit<RoomOptions<TPresence>, 'transport'>,
  ): Room<TPresence>;
  getAdapter(room: RoomIdentity): MockTransportAdapter;
  emit(room: RoomIdentity, signal: TransportSignal): void;
  forceDisconnect(room: RoomIdentity, reason?: string): void;
  waitFor(condition: () => boolean, timeoutMs?: number): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createMockRoomHarness(): Promise<MockRoomHarness> {
  vi.resetModules();

  const network = new MockTransportNetwork();
  const createdRooms: Room[] = [];

  vi.doMock('../src/transports/select-transport', () => ({
    selectTransportAdapter: (roomId: string, peerId: string) => {
      return network.createAdapter(roomId, peerId);
    },
  }));

  const mod = (await import('../src/index')) as { createRoom: CreateRoomFn };

  return {
    createRoom<TPresence extends PresenceData = PresenceData>(
      roomId: string,
      options: Omit<RoomOptions<TPresence>, 'transport'> = {},
    ): Room<TPresence> {
      const room = mod.createRoom<TPresence>(roomId, {
        ...options,
        transport: 'websocket',
      });

      createdRooms.push(room);
      return room;
    },
    getAdapter(room: RoomIdentity): MockTransportAdapter {
      const adapter = network.getAdapter(room.id, room.peerId);
      if (!adapter) {
        throw new Error(`Missing mock transport adapter for ${room.id}/${room.peerId}.`);
      }

      return adapter;
    },
    emit(room: RoomIdentity, signal: TransportSignal): void {
      network.emit(room.id, room.peerId, signal);
    },
    forceDisconnect(room: RoomIdentity, reason?: string): void {
      network.forceDisconnect(room.id, room.peerId, reason);
    },
    async waitFor(condition: () => boolean, timeoutMs = 1_500): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (!condition()) {
        if (Date.now() > deadline) {
          throw new Error('Timed out waiting for condition.');
        }

        await Promise.resolve();
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
      }
    },
    async cleanup(): Promise<void> {
      await Promise.allSettled(
        createdRooms.map(async (room) => {
          await room.disconnect().catch(() => {
            return undefined;
          });
        }),
      );

      network.clear();
      vi.doUnmock('../src/transports/select-transport');
      vi.resetModules();
    },
  };
}
