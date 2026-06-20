import {
  DEVTOOLS_BRIDGE_GLOBAL,
  DEVTOOLS_BRIDGE_VERSION,
  type DevtoolsBridge,
} from '@roomful/devtools';
import { afterEach, describe, expect, it } from 'vitest';

import { createRoom } from './index';

type WindowListener = (...args: unknown[]) => void;

class MockWindowForDevtools {
  private readonly listeners = new Map<string, Set<WindowListener>>();

  public addEventListener(eventName: string, listener: WindowListener): void {
    const listeners = this.listeners.get(eventName) ?? new Set<WindowListener>();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
  }

  public removeEventListener(eventName: string, listener: WindowListener): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return;
    }

    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }
  }
}

declare global {
  interface Window {
    __roomful_devtools__?: DevtoolsBridge;
  }
}

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

function getBridge(): DevtoolsBridge {
  const bridge = globalThis.window?.__roomful_devtools__;
  if (!bridge) {
    throw new Error('Expected devtools bridge to be installed.');
  }

  return bridge;
}

describe('Room devtools bridge', () => {
  const originalWindow = globalThis.window;

  afterEach(async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow,
    });
  });

  it('registers connected rooms and exposes serialized state with diffs', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: new MockWindowForDevtools() as unknown as Window,
    });

    const room = createRoom<{ name: string; role: string }>('room-devtools-state', {
      presence: {
        name: 'Alice',
        role: 'editor',
      },
      transport: 'broadcast',
    });
    const state = room.useState({
      initialValue: {
        count: 0,
      },
    });

    await room.connect();
    state.patch({
      count: 1,
    });

    const bridge = getBridge();
    expect(bridge.version).toBe(DEVTOOLS_BRIDGE_VERSION);

    const [summary] = bridge.listRooms();
    expect(summary).toMatchObject({
      hasSimulatedPeer: false,
      hasState: true,
      peerCount: 0,
      peerId: room.peerId,
      roomId: room.id,
      status: 'connected',
      transport: 'broadcast',
    });

    const snapshot = bridge.getSnapshot(summary?.instanceId ?? '');
    expect(snapshot).not.toBeNull();
    expect(snapshot?.peers).toEqual([
      {
        id: room.peerId,
        isSelf: true,
        isSimulated: false,
        joinedAt: expect.any(Number),
        lastSeen: expect.any(Number),
        presence: {
          id: room.peerId,
          joinedAt: expect.any(Number),
          lastSeen: expect.any(Number),
          name: 'Alice',
          role: 'editor',
        },
      },
    ]);
    expect(snapshot?.state).toEqual({
      available: true,
      diff: [
        {
          kind: 'changed',
          next: 1,
          path: 'count',
          previous: 0,
        },
      ],
      lastChangedBy: room.peerId,
      lastUpdatedAt: expect.any(Number),
      pending: false,
      queuedMutationCount: 0,
      reason: 'patch',
      strategy: 'lww',
      value: {
        count: 1,
      },
    });

    await room.disconnect();
  });

  it('captures inbound and outbound custom events with sender metadata', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: new MockWindowForDevtools() as unknown as Window,
    });

    const roomA = createRoom<{ name: string }>('room-devtools-events', {
      presence: {
        name: 'Alice',
      },
      transport: 'broadcast',
    });
    const roomB = createRoom<{ name: string }>('room-devtools-events', {
      presence: {
        name: 'Bob',
      },
      transport: 'broadcast',
    });

    await roomA.connect();
    await roomB.connect();
    await waitFor(() => {
      return roomA.peerCount === 1 && roomB.peerCount === 1;
    });

    roomA.useEvents().emit('ack', {
      ok: true,
    });
    roomB.useEvents().emit('ping', {
      from: 'bob',
    });

    await waitFor(() => {
      const bridge = getBridge();
      const summary = bridge.listRooms().find((entry) => {
        return entry.peerId === roomA.peerId;
      });
      const snapshot = bridge.getSnapshot(summary?.instanceId ?? '');
      return (snapshot?.events.length ?? 0) >= 2;
    });

    const bridge = getBridge();
    const summary = bridge.listRooms().find((entry) => {
      return entry.peerId === roomA.peerId;
    });
    const snapshot = bridge.getSnapshot(summary?.instanceId ?? '');

    expect(snapshot?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'outgoing',
          fromPeerId: roomA.peerId,
          name: 'ack',
          payload: {
            ok: true,
          },
          toPeerId: null,
        }),
        expect.objectContaining({
          direction: 'incoming',
          fromPeerId: roomB.peerId,
          name: 'ping',
          payload: {
            from: 'bob',
          },
          sender: expect.objectContaining({
            name: 'Bob',
          }),
        }),
      ]),
    );

    await roomA.disconnect();
    await roomB.disconnect();
  });

  it('injects and disconnects a simulated peer without exposing it as a separate room', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: new MockWindowForDevtools() as unknown as Window,
    });

    const room = createRoom<{ name: string }>('room-devtools-simulated', {
      presence: {
        name: 'Alice',
      },
      transport: 'broadcast',
    });

    await room.connect();

    const bridge = getBridge();
    const summary = bridge.listRooms().find((entry) => {
      return entry.peerId === room.peerId;
    });
    expect(summary?.peerId).toBe(room.peerId);
    expect(bridge.injectSimulatedPeer(summary?.instanceId ?? '')).toEqual({
      ok: true,
    });

    await waitFor(() => {
      return room.peerCount === 1;
    });

    const connectedSnapshot = bridge.getSnapshot(summary?.instanceId ?? '');
    expect(bridge.listRooms()).toHaveLength(1);
    expect(connectedSnapshot?.hasSimulatedPeer).toBe(true);
    expect(
      connectedSnapshot?.peers.some((peer) => {
        return peer.isSimulated;
      }),
    ).toBe(true);

    expect(bridge.disconnectSimulatedPeer(summary?.instanceId ?? '')).toEqual({
      ok: true,
    });

    await waitFor(() => {
      return room.peerCount === 0;
    });

    const disconnectedSnapshot = bridge.getSnapshot(summary?.instanceId ?? '');
    expect(disconnectedSnapshot?.hasSimulatedPeer).toBe(false);

    await room.disconnect();
  });

  it('does not install the bridge in non-browser runtimes', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const room = createRoom('room-devtools-none', {
      transport: 'broadcast',
    });

    await room.connect();

    expect(globalThis.window).toBeUndefined();
    expect(Reflect.has(globalThis, DEVTOOLS_BRIDGE_GLOBAL)).toBe(false);

    await room.disconnect();
  });
});
