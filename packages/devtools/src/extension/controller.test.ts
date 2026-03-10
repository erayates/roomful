// @vitest-environment jsdom

import {
  fireEvent,
  getByRole,
  getByTestId,
  screen,
  waitFor,
  within,
} from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DevtoolsRoomSnapshot, DevtoolsRoomSummary } from '../types';
import { createDevtoolsPanelController } from './controller.js';
import type { DevtoolsBridgeClient, DevtoolsBridgeReadResult } from './types.js';

function createSummary(
  roomId: string,
  peerId: string,
  overrides: Partial<DevtoolsRoomSummary> = {},
): DevtoolsRoomSummary {
  return {
    hasSimulatedPeer: false,
    hasState: true,
    instanceId: `${roomId}::${peerId}`,
    peerCount: 1,
    peerId,
    roomId,
    status: 'connected',
    transport: 'broadcast',
    ...overrides,
  };
}

function createSnapshot(
  summary: DevtoolsRoomSummary,
  overrides: Partial<DevtoolsRoomSnapshot> = {},
): DevtoolsRoomSnapshot {
  return {
    ...summary,
    bridgeVersion: 1,
    errors: [],
    events: [
      {
        direction: 'incoming',
        fromPeerId: 'peer-b',
        id: 'event-1',
        name: 'ping',
        payload: {
          ok: true,
        },
        sender: {
          id: 'peer-b',
          name: 'Bob',
        },
        timestamp: 1_700_000_000_000,
        toPeerId: summary.peerId,
      },
    ],
    peers: [
      {
        id: summary.peerId,
        isSelf: true,
        isSimulated: false,
        joinedAt: 1,
        lastSeen: 2,
        presence: {
          id: summary.peerId,
          name: 'Alice',
        },
      },
      {
        id: 'peer-b',
        isSelf: false,
        isSimulated: false,
        joinedAt: 3,
        lastSeen: 4,
        presence: {
          id: 'peer-b',
          name: 'Bob',
          status: 'active',
        },
      },
    ],
    state: {
      available: true,
      diff: [
        {
          kind: 'changed',
          next: 2,
          path: 'count',
          previous: 1,
        },
      ],
      lastChangedBy: summary.peerId,
      lastUpdatedAt: 1_700_000_000_100,
      pending: false,
      queuedMutationCount: 0,
      reason: 'patch',
      strategy: 'lww',
      value: {
        count: 2,
        nested: {
          ready: true,
        },
      },
    },
    ...overrides,
  };
}

function createReadResult(
  rooms: DevtoolsRoomSummary[],
  overrides: Partial<DevtoolsBridgeReadResult> = {},
): DevtoolsBridgeReadResult {
  return {
    error: null,
    rooms,
    status: 'ready',
    version: 1,
    ...overrides,
  };
}

function createClient(overrides: Partial<DevtoolsBridgeClient> = {}): DevtoolsBridgeClient {
  return {
    disconnectSimulatedPeer: vi.fn(async () => {
      return {
        ok: true,
      };
    }),
    injectSimulatedPeer: vi.fn(async () => {
      return {
        ok: true,
      };
    }),
    readRooms: vi.fn(async () => {
      return createReadResult([]);
    }),
    readSnapshot: vi.fn(async () => {
      return {
        error: null,
        snapshot: null,
      };
    }),
    ...overrides,
  };
}

describe('createDevtoolsPanelController', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders an empty state when the SDK bridge is not available', async () => {
    const client = createClient({
      readRooms: vi.fn(async () => {
        return {
          error: null,
          rooms: [],
          status: 'missing',
          version: null,
        };
      }),
    });
    const root = document.createElement('div');
    document.body.appendChild(root);

    const controller = createDevtoolsPanelController({
      client,
      pollIntervalMs: 60_000,
      root,
    });

    await controller.start();

    expect(screen.getByText('SDK not detected')).toBeTruthy();
    expect(
      screen.getByText(
        'Expose window.__flockjs_devtools__ from the inspected page to populate the FlockJS panel.',
      ),
    ).toBeTruthy();

    controller.stop();
  });

  it('renders room data, diff highlighting, and the room selector for multiple rooms', async () => {
    const primaryRoom = createSummary('room-a', 'peer-a');
    const secondaryRoom = createSummary('room-b', 'peer-c', {
      transport: 'polling',
    });
    const client = createClient({
      readRooms: vi.fn(async () => {
        return createReadResult([primaryRoom, secondaryRoom]);
      }),
      readSnapshot: vi.fn(async (instanceId: string) => {
        const snapshot =
          instanceId === secondaryRoom.instanceId
            ? createSnapshot(secondaryRoom, {
                state: {
                  available: true,
                  diff: [],
                  lastChangedBy: secondaryRoom.peerId,
                  lastUpdatedAt: 1_700_000_000_500,
                  pending: false,
                  queuedMutationCount: 0,
                  reason: 'set',
                  strategy: 'lww',
                  value: {
                    mode: 'polling',
                  },
                },
              })
            : createSnapshot(primaryRoom);
        return {
          error: null,
          snapshot,
        };
      }),
    });
    const root = document.createElement('div');
    document.body.appendChild(root);

    const controller = createDevtoolsPanelController({
      client,
      pollIntervalMs: 60_000,
      root,
    });

    await controller.start();

    const selector = getByTestId(root, 'room-selector');
    expect(selector).toBeTruthy();
    expect((selector as HTMLSelectElement).options).toHaveLength(2);
    const peersHeading = screen.getByText('Connected Peers');
    const peersSection = peersHeading.closest('section');
    expect(peersSection).toBeTruthy();
    expect(within(peersSection as HTMLElement).getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Event Log')).toBeTruthy();
    expect(screen.getByText('ping')).toBeTruthy();
    expect(getByTestId(root, 'state-node-count').getAttribute('data-diff-kind')).toBe('changed');

    fireEvent.change(selector, {
      target: {
        value: secondaryRoom.instanceId,
      },
    });

    await waitFor(() => {
      expect(screen.getByText('polling')).toBeTruthy();
    });

    controller.stop();
  });

  it('toggles the simulated peer through the bridge client', async () => {
    const summary = createSummary('room-a', 'peer-a');
    const readRooms = vi.fn(async () => {
      return createReadResult([summary]);
    });
    const readSnapshot = vi
      .fn<DevtoolsBridgeClient['readSnapshot']>()
      .mockResolvedValueOnce({
        error: null,
        snapshot: createSnapshot(summary, {
          hasSimulatedPeer: false,
        }),
      })
      .mockResolvedValueOnce({
        error: null,
        snapshot: createSnapshot(summary, {
          hasSimulatedPeer: true,
        }),
      });
    const injectSimulatedPeer = vi.fn(async () => {
      return {
        ok: true,
      };
    });
    const client = createClient({
      injectSimulatedPeer,
      readRooms,
      readSnapshot,
    });
    const root = document.createElement('div');
    document.body.appendChild(root);

    const controller = createDevtoolsPanelController({
      client,
      pollIntervalMs: 60_000,
      root,
    });

    await controller.start();

    fireEvent.click(getByRole(root, 'button', { name: 'Inject Simulated Peer' }));

    await waitFor(() => {
      expect(injectSimulatedPeer).toHaveBeenCalledWith(summary.instanceId);
      expect(screen.getByText('Remove Simulated Peer')).toBeTruthy();
    });

    controller.stop();
  });
});
