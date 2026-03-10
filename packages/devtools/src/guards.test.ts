import { describe, expect, it } from 'vitest';

import { DEVTOOLS_BRIDGE_VERSION } from './constants';
import { isDevtoolsRoomSnapshot, isDevtoolsRoomSummary } from './guards';
import type { DevtoolsRoomSnapshot } from './types';

describe('devtools guards', () => {
  it('accepts valid room summaries', () => {
    expect(
      isDevtoolsRoomSummary({
        hasSimulatedPeer: false,
        hasState: true,
        instanceId: 'room-a::peer-a',
        peerCount: 2,
        peerId: 'peer-a',
        roomId: 'room-a',
        status: 'connected',
        transport: 'broadcast',
      }),
    ).toBe(true);
  });

  it('rejects invalid room summaries', () => {
    expect(
      isDevtoolsRoomSummary({
        instanceId: 'room-a::peer-a',
        peerCount: '2',
      }),
    ).toBe(false);
  });

  it('accepts valid room snapshots', () => {
    const snapshot: DevtoolsRoomSnapshot = {
      bridgeVersion: DEVTOOLS_BRIDGE_VERSION,
      errors: [],
      events: [],
      hasSimulatedPeer: false,
      hasState: true,
      instanceId: 'room-a::peer-a',
      peerCount: 1,
      peerId: 'peer-a',
      peers: [],
      roomId: 'room-a',
      state: {
        available: true,
        diff: [],
        lastChangedBy: 'peer-a',
        lastUpdatedAt: 1,
        pending: false,
        queuedMutationCount: 0,
        reason: 'set',
        strategy: 'lww',
        value: {
          ready: true,
        },
      },
      status: 'connected',
      transport: 'websocket',
    };

    expect(isDevtoolsRoomSnapshot(snapshot)).toBe(true);
  });

  it('rejects snapshots with malformed nested data', () => {
    expect(
      isDevtoolsRoomSnapshot({
        bridgeVersion: DEVTOOLS_BRIDGE_VERSION,
        errors: [],
        events: [],
        hasSimulatedPeer: false,
        hasState: true,
        instanceId: 'room-a::peer-a',
        peerCount: 1,
        peerId: 'peer-a',
        peers: [],
        roomId: 'room-a',
        state: {
          available: true,
          diff: [],
          lastChangedBy: 'peer-a',
          lastUpdatedAt: 1,
          pending: false,
          queuedMutationCount: 0,
          reason: 'set',
          strategy: 'lww',
          value: {
            ready: true,
          },
        },
        status: 'connected',
        transport: 'invalid',
      }),
    ).toBe(false);
  });
});
