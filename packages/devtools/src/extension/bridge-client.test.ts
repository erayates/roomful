import { describe, expect, it } from 'vitest';

import { DEVTOOLS_BRIDGE_VERSION } from '../constants';
import type { DevtoolsRoomSnapshot, DevtoolsRoomSummary } from '../types';
import { createInspectedPageBridgeClient } from './bridge-client.js';
import type { ExtensionDevtoolsApi } from './types.js';

interface EvalInvocation {
  readonly expression: string;
}

interface EvalResponse {
  readonly exceptionInfo?: {
    readonly isError?: boolean;
    readonly description?: string;
    readonly value?: unknown;
  };
  readonly result: unknown;
}

function createSummary(roomId: string, peerId: string): DevtoolsRoomSummary {
  return {
    hasSimulatedPeer: false,
    hasState: true,
    instanceId: `${roomId}::${peerId}`,
    peerCount: 1,
    peerId,
    roomId,
    status: 'connected',
    transport: 'broadcast',
  };
}

function createSnapshot(summary: DevtoolsRoomSummary): DevtoolsRoomSnapshot {
  return {
    ...summary,
    bridgeVersion: DEVTOOLS_BRIDGE_VERSION,
    errors: [],
    events: [],
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
    ],
    state: {
      available: true,
      diff: [
        {
          kind: 'changed',
          next: 1,
          path: 'count',
          previous: 0,
        },
      ],
      lastChangedBy: summary.peerId,
      lastUpdatedAt: 3,
      pending: false,
      queuedMutationCount: 0,
      reason: 'patch',
      strategy: 'lww',
      value: {
        count: 1,
      },
    },
  };
}

function createDevtoolsApi(
  responses: EvalResponse[],
  invocations: EvalInvocation[],
): ExtensionDevtoolsApi {
  return {
    inspectedWindow: {
      eval(expression, callback) {
        invocations.push({
          expression,
        });

        const response = responses.shift();
        if (!response) {
          callback(undefined, {
            description: 'No queued response available.',
            isError: true,
          });
          return undefined;
        }

        callback(response.result, response.exceptionInfo);
        return undefined;
      },
    },
    panels: {
      create() {
        return undefined;
      },
    },
  };
}

describe('createInspectedPageBridgeClient', () => {
  it('reports ready bridge state and validates snapshots', async () => {
    const invocations: EvalInvocation[] = [];
    const summary = createSummary('room-a', 'peer-a');
    const client = createInspectedPageBridgeClient(
      createDevtoolsApi(
        [
          {
            result: {
              available: true,
              rooms: [summary],
              version: DEVTOOLS_BRIDGE_VERSION,
            },
          },
          {
            result: createSnapshot(summary),
          },
        ],
        invocations,
      ),
    );

    await expect(client.readRooms()).resolves.toEqual({
      error: null,
      rooms: [summary],
      status: 'ready',
      version: DEVTOOLS_BRIDGE_VERSION,
    });
    await expect(client.readSnapshot(summary.instanceId)).resolves.toEqual({
      error: null,
      snapshot: createSnapshot(summary),
    });

    expect(invocations[0]?.expression).toContain('__flockjs_devtools__');
    expect(invocations[1]?.expression).toContain(summary.instanceId);
  });

  it('reports missing bridge state when the SDK bridge is unavailable', async () => {
    const client = createInspectedPageBridgeClient(
      createDevtoolsApi(
        [
          {
            result: {
              available: false,
              rooms: [],
              version: null,
            },
          },
        ],
        [],
      ),
    );

    await expect(client.readRooms()).resolves.toEqual({
      error: null,
      rooms: [],
      status: 'missing',
      version: null,
    });
  });

  it('returns a typed error when the inspected page reports invalid snapshot data', async () => {
    const summary = createSummary('room-a', 'peer-a');
    const client = createInspectedPageBridgeClient(
      createDevtoolsApi(
        [
          {
            result: {
              available: true,
              rooms: [summary],
              version: DEVTOOLS_BRIDGE_VERSION,
            },
          },
          {
            result: {
              invalid: true,
            },
          },
        ],
        [],
      ),
    );

    await client.readRooms();
    await expect(client.readSnapshot(summary.instanceId)).resolves.toEqual({
      error: 'Page bridge returned an invalid room snapshot.',
      snapshot: null,
    });
  });

  it('serializes instance ids when sending simulated-peer commands', async () => {
    const invocations: EvalInvocation[] = [];
    const summary = createSummary('room-b', 'peer-"quoted"');
    const client = createInspectedPageBridgeClient(
      createDevtoolsApi(
        [
          {
            result: {
              ok: true,
            },
          },
          {
            result: {
              ok: true,
            },
          },
        ],
        invocations,
      ),
    );

    await expect(client.injectSimulatedPeer(summary.instanceId)).resolves.toEqual({
      ok: true,
    });
    await expect(client.disconnectSimulatedPeer(summary.instanceId)).resolves.toEqual({
      ok: true,
    });

    expect(invocations[0]?.expression).toContain('injectSimulatedPeer');
    expect(invocations[0]?.expression).toContain('"room-b::peer-\\"quoted\\""');
    expect(invocations[1]?.expression).toContain('disconnectSimulatedPeer');
  });
});
