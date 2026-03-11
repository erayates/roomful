import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TransportAdapter, TransportSignal } from './transports/transport';
import type { Room, RoomOptions } from './types';

const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const waitFor = async (condition: () => boolean, timeoutMs = 1_500): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition.');
    }

    await wait(10);
  }
};

class LinkedTransportRegistry {
  private readonly rooms = new Map<string, Map<string, LinkedTransportAdapter>>();

  public register(adapter: LinkedTransportAdapter): void {
    const room = this.rooms.get(adapter.roomId) ?? new Map<string, LinkedTransportAdapter>();
    room.set(adapter.peerId, adapter);
    this.rooms.set(adapter.roomId, room);
  }

  public unregister(adapter: LinkedTransportAdapter): void {
    const room = this.rooms.get(adapter.roomId);
    if (!room) {
      return;
    }

    room.delete(adapter.peerId);
    if (room.size === 0) {
      this.rooms.delete(adapter.roomId);
      return;
    }

    this.rooms.set(adapter.roomId, room);
  }

  public send(roomId: string, peerId: string, signal: TransportSignal): void {
    this.rooms.get(roomId)?.get(peerId)?.deliver(signal);
  }

  public broadcast(roomId: string, fromPeerId: string, signal: TransportSignal): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    for (const [peerId, adapter] of room.entries()) {
      if (peerId === fromPeerId) {
        continue;
      }

      adapter.deliver(signal);
    }
  }

  public getAdapter(peerId: string): LinkedTransportAdapter | null {
    for (const room of this.rooms.values()) {
      const adapter = room.get(peerId);
      if (adapter) {
        return adapter;
      }
    }

    return null;
  }
}

class LinkedTransportAdapter implements TransportAdapter {
  public readonly kind = 'in-memory' as const;

  public readonly outboundSignals: TransportSignal[] = [];

  private handler: ((signal: TransportSignal) => void) | null = null;

  private connected = false;

  public constructor(
    public readonly roomId: string,
    public readonly peerId: string,
    private readonly registry: LinkedTransportRegistry,
  ) {}

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.registry.register(this);
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    if (!this.connected) {
      this.handler = null;
      return;
    }

    this.registry.unregister(this);
    this.connected = false;
    this.handler = null;
  }

  public send(signal: TransportSignal): void {
    this.outboundSignals.push(signal);
    if ('toPeerId' in signal && typeof signal.toPeerId === 'string') {
      this.registry.send(this.roomId, signal.toPeerId, signal);
      return;
    }

    this.broadcast(signal);
  }

  public broadcast(signal: TransportSignal): void {
    this.outboundSignals.push(signal);
    this.registry.broadcast(this.roomId, this.peerId, signal);
  }

  public onMessage(handler: (signal: TransportSignal) => void): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) {
        this.handler = null;
      }
    };
  }

  public deliver(signal: TransportSignal): void {
    this.handler?.(signal);
  }
}

interface TestPresence {
  name: string;
  role?: 'editor' | 'viewer';
}

async function createEncryptionHarness(
  roomId: string,
  roomAOptions: RoomOptions<TestPresence>,
  roomBOptions: RoomOptions<TestPresence>,
): Promise<{
  registry: LinkedTransportRegistry;
  roomA: Room<TestPresence>;
  roomB: Room<TestPresence>;
}> {
  vi.resetModules();
  const registry = new LinkedTransportRegistry();

  vi.doMock('./transports/select-transport', () => ({
    selectTransportAdapter: (selectedRoomId: string, peerId: string) => {
      return new LinkedTransportAdapter(selectedRoomId, peerId, registry);
    },
  }));

  const mod = await import('./index');
  return {
    registry,
    roomA: mod.createRoom<TestPresence>(roomId, roomAOptions),
    roomB: mod.createRoom<TestPresence>(roomId, roomBOptions),
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock('./transports/select-transport');
  await wait(10);
});

describe('Room end-to-end encryption', () => {
  it('encrypts presence, state, awareness, and event traffic when peers share the same key', async () => {
    const { registry, roomA, roomB } = await createEncryptionHarness(
      'room-encryption-shared',
      {
        presence: {
          name: 'Alice',
        },
        encryption: {
          passphrase: 'shared-secret',
        },
      },
      {
        presence: {
          name: 'Bob',
        },
        encryption: {
          passphrase: 'shared-secret',
        },
      },
    );

    const stateA = roomA.useState({
      initialValue: {
        count: 0,
      },
    });
    const stateB = roomB.useState({
      initialValue: {
        count: 0,
      },
    });
    const awarenessA = roomA.useAwareness();
    const awarenessB = roomB.useAwareness();
    const eventSpy = vi.fn();
    roomB.useEvents().on('ping', eventSpy);

    await Promise.all([roomA.connect(), roomB.connect()]);

    await waitFor(() => {
      return (
        roomA.usePresence().get(roomB.peerId)?.name === 'Bob' &&
        roomB.usePresence().get(roomA.peerId)?.name === 'Alice'
      );
    });

    roomA.usePresence().update({
      role: 'editor',
    });
    stateA.set({
      count: 1,
    });
    awarenessA.setTyping(true);
    roomA.useEvents().emit('ping', {
      ok: true,
    });

    await waitFor(() => {
      return (
        roomB.usePresence().get(roomA.peerId)?.role === 'editor' &&
        stateB.get().count === 1 &&
        roomB.useAwareness().getAll().some((entry) => {
          return entry.peerId === roomA.peerId && entry.typing === true;
        }) &&
        eventSpy.mock.calls.length === 1
      );
    });

    const adapterA = registry.getAdapter(roomA.peerId);
    const adapterB = registry.getAdapter(roomB.peerId);
    expect(adapterA).not.toBeNull();
    expect(adapterB).not.toBeNull();

    const applicationSignals = [...adapterA!.outboundSignals, ...adapterB!.outboundSignals].filter(
      (signal) => {
        return signal.type !== 'hello' && signal.type !== 'welcome' && signal.type !== 'leave';
      },
    );

    expect(applicationSignals.length).toBeGreaterThan(0);
    expect(applicationSignals.every((signal) => signal.type === 'encrypted')).toBe(true);
    expect(
      applicationSignals.some((signal) => {
        if (signal.type !== 'encrypted') {
          return false;
        }

        return (
          signal.payload.version === 1 &&
          signal.payload.ciphertext instanceof Uint8Array &&
          signal.payload.ciphertext.byteLength > 0
        );
      }),
    ).toBe(true);

    awarenessB.setTyping(false);
    await roomA.disconnect();
    await roomB.disconnect();
  });

  it('encrypts CRDT sync and Yjs awareness traffic when peers share the same key', async () => {
    const { registry, roomA, roomB } = await createEncryptionHarness(
      'room-encryption-crdt',
      {
        encryption: {
          passphrase: 'shared-secret',
        },
      },
      {
        encryption: {
          passphrase: 'shared-secret',
        },
      },
    );

    const providerA = roomA.getYProvider();
    const providerB = roomB.getYProvider();
    const textA = roomA.getYDoc().getText('content');
    const textB = roomB.getYDoc().getText('content');

    await Promise.all([roomA.connect(), roomB.connect()]);
    await waitFor(() => providerA.synced && providerB.synced);

    textA.insert(0, 'encrypted-crdt');
    providerA.awareness.setLocalStateField('selection', {
      anchor: 0,
      head: 14,
    });

    await waitFor(() => textB.toJSON() === 'encrypted-crdt');
    await waitFor(() => {
      return Array.from(providerB.awareness.getStates().values()).some((state) => {
        if (!state || typeof state !== 'object') {
          return false;
        }

        const selection = Reflect.get(state, 'selection');
        if (!selection || typeof selection !== 'object') {
          return false;
        }

        return Reflect.get(selection, 'anchor') === 0 && Reflect.get(selection, 'head') === 14;
      });
    });

    const adapterA = registry.getAdapter(roomA.peerId);
    const adapterB = registry.getAdapter(roomB.peerId);
    expect(adapterA).not.toBeNull();
    expect(adapterB).not.toBeNull();

    const applicationSignals = [...adapterA!.outboundSignals, ...adapterB!.outboundSignals].filter(
      (signal) => {
        return signal.type !== 'hello' && signal.type !== 'welcome';
      },
    );

    expect(applicationSignals.length).toBeGreaterThan(0);
    expect(applicationSignals.every((signal) => signal.type === 'encrypted')).toBe(true);

    await roomA.disconnect();
    await roomB.disconnect();
  });

  it('fails gracefully with DECRYPTION_ERROR when peers use different keys', async () => {
    const { roomA, roomB } = await createEncryptionHarness(
      'room-encryption-wrong-key',
      {
        presence: {
          name: 'Alice',
        },
        encryption: {
          passphrase: 'alpha',
        },
      },
      {
        presence: {
          name: 'Bob',
        },
        encryption: {
          passphrase: 'beta',
        },
      },
    );

    const onError = vi.fn();
    roomB.on('error', onError);

    await Promise.all([roomA.connect(), roomB.connect()]);

    await waitFor(() => roomB.peerCount === 1);
    await waitFor(() => {
      return onError.mock.calls.some(([error]) => {
        return error.code === 'DECRYPTION_ERROR';
      });
    });

    expect(roomB.usePresence().get(roomA.peerId)).toEqual(
      expect.objectContaining({
        id: roomA.peerId,
      }),
    );
    expect(roomB.usePresence().get(roomA.peerId)).not.toHaveProperty('name');

    await roomA.disconnect();
    await roomB.disconnect();
  });

  it('emits ENCRYPTION_ERROR when peers disagree on encryption mode', async () => {
    const { roomA, roomB } = await createEncryptionHarness(
      'room-encryption-mode-mismatch',
      {
        presence: {
          name: 'Alice',
        },
        encryption: {
          passphrase: 'shared-secret',
        },
      },
      {
        presence: {
          name: 'Bob',
        },
      },
    );

    const onEncryptedRoomError = vi.fn();
    const onPlainRoomError = vi.fn();
    roomA.on('error', onEncryptedRoomError);
    roomB.on('error', onPlainRoomError);

    await Promise.all([roomA.connect(), roomB.connect()]);

    await waitFor(() => {
      return (
        onEncryptedRoomError.mock.calls.some(([error]) => error.code === 'ENCRYPTION_ERROR') &&
        onPlainRoomError.mock.calls.some(([error]) => error.code === 'ENCRYPTION_ERROR')
      );
    });

    expect(roomA.peerCount).toBe(0);
    expect(roomB.peerCount).toBe(0);

    await roomA.disconnect();
    await roomB.disconnect();
  });
});
