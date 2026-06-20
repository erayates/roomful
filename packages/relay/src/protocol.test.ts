import { encode } from '@msgpack/msgpack';
import { describe, expect, it } from 'vitest';

import {
  parseRelayClientMessage,
  type RelayTransportMessage,
  resolveRelayTransportSession,
  serializeRelayServerMessage,
  serializeRelayTransportMessage,
} from './protocol.js';

const protocol = {
  minVersion: 1 as const,
  maxVersion: 2 as const,
  codecs: ['json', 'msgpack'] as const,
  preferredCodec: 'msgpack' as const,
};

function expectTransportMessage(
  message: ReturnType<typeof parseRelayClientMessage>,
  expected: Omit<RelayTransportMessage, 'rawPayload'>,
): asserts message is RelayTransportMessage {
  expect(message).toMatchObject(expected);
  if (!message || message.type !== 'transport') {
    throw new Error('Expected transport message.');
  }
}

describe('relay protocol', () => {
  it('serializes relay server messages', () => {
    expect(
      serializeRelayServerMessage({
        type: 'joined',
        roomId: 'room-a',
        peerId: 'peer-a',
        peers: [{ peerId: 'peer-b' }],
      }),
    ).toBe('{"type":"joined","roomId":"room-a","peerId":"peer-a","peers":[{"peerId":"peer-b"}]}');
  });

  it('parses join and leave client messages', () => {
    expect(
      parseRelayClientMessage(
        JSON.stringify({
          type: 'join',
          roomId: 'room-a',
          peerId: 'peer-a',
          token: 'token-1',
          protocol,
          maxPeers: 2,
        }),
      ),
    ).toEqual({
      type: 'join',
      roomId: 'room-a',
      peerId: 'peer-a',
      token: 'token-1',
      protocol,
      maxPeers: 2,
    });

    expect(
      parseRelayClientMessage(
        JSON.stringify({
          type: 'join',
          roomId: 'room-a',
          peerId: 'peer-a',
          maxPeers: 0,
        }),
      ),
    ).toEqual({
      type: 'join',
      roomId: 'room-a',
      peerId: 'peer-a',
    });

    expect(
      parseRelayClientMessage(
        JSON.stringify({
          type: 'leave',
          roomId: 'room-a',
          peerId: 'peer-a',
        }),
      ),
    ).toEqual({
      type: 'leave',
      roomId: 'room-a',
      peerId: 'peer-a',
    });
  });

  it('parses signal client messages with description or candidate', () => {
    expect(
      parseRelayClientMessage(
        JSON.stringify({
          type: 'signal',
          roomId: 'room-a',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          description: {
            type: 'offer',
            sdp: 'v=0',
          },
        }),
      ),
    ).toEqual({
      type: 'signal',
      roomId: 'room-a',
      fromPeerId: 'peer-a',
      toPeerId: 'peer-b',
      description: {
        type: 'offer',
        sdp: 'v=0',
      },
    });

    expect(
      parseRelayClientMessage(
        JSON.stringify({
          type: 'signal',
          roomId: 'room-a',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          candidate: {
            candidate: 'candidate:1',
            sdpMid: null,
            usernameFragment: null,
            sdpMLineIndex: 0,
          },
        }),
      ),
    ).toEqual({
      type: 'signal',
      roomId: 'room-a',
      fromPeerId: 'peer-a',
      toPeerId: 'peer-b',
      candidate: {
        candidate: 'candidate:1',
        sdpMid: null,
        usernameFragment: null,
        sdpMLineIndex: 0,
      },
    });
  });

  it('parses json transport client messages and preserves the raw frame', () => {
    const parsed = parseRelayClientMessage(
      JSON.stringify({
        type: 'transport',
        message: {
          source: 'roomful',
          protocolVersion: 2,
          codec: 'json',
          roomId: 'room-a',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          timestamp: 1,
          type: 'event',
          payload: {
            name: 'ping',
            payload: {
              ok: true,
            },
          },
        },
      }),
    );

    expectTransportMessage(parsed, {
      type: 'transport',
      encoding: 'json',
      signal: {
        type: 'event',
        roomId: 'room-a',
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
        timestamp: 1,
        payload: {
          name: 'ping',
          payload: {
            ok: true,
          },
        },
      },
    });
    expect(parsed.rawPayload).toBeTypeOf('string');
  });

  it('parses state and CRDT transport client messages', () => {
    const stateParsed = parseRelayClientMessage(
      JSON.stringify({
        type: 'transport',
        message: {
          source: 'roomful',
          protocolVersion: 2,
          codec: 'json',
          roomId: 'room-state',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          timestamp: 1,
          type: 'state:update',
          payload: {
            value: {
              count: 1,
            },
            history: [],
            vectorClock: {
              'peer-a': 1,
            },
            changedBy: 'peer-a',
            timestamp: 1,
            reason: 'set',
          },
        },
      }),
    );

    expectTransportMessage(stateParsed, {
      type: 'transport',
      encoding: 'json',
      signal: {
        type: 'state:update',
        roomId: 'room-state',
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
        timestamp: 1,
        payload: {
          value: {
            count: 1,
          },
          history: [],
          vectorClock: {
            'peer-a': 1,
          },
          changedBy: 'peer-a',
          timestamp: 1,
          reason: 'set',
        },
      },
    });
    expect(stateParsed.rawPayload).toBeTypeOf('string');

    const encodedPayload = new Uint8Array(
      encode({
        type: 'transport',
        message: {
          source: 'roomful',
          protocolVersion: 2,
          codec: 'msgpack',
          roomId: 'room-crdt',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          timestamp: 2,
          type: 'crdt:sync',
          payload: {
            kind: 'update',
            data: new Uint8Array([1, 2, 3]),
            meta: {
              reason: 'set',
              changedBy: 'peer-a',
              timestamp: 2,
            },
          },
        },
      }),
    );

    const crdtParsed = parseRelayClientMessage(encodedPayload);
    expectTransportMessage(crdtParsed, {
      type: 'transport',
      encoding: 'msgpack',
      signal: {
        type: 'crdt:sync',
        roomId: 'room-crdt',
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
        timestamp: 2,
        payload: {
          kind: 'update',
          data: new Uint8Array([1, 2, 3]),
          meta: {
            reason: 'set',
            changedBy: 'peer-a',
            timestamp: 2,
          },
        },
      },
    });
    expect(crdtParsed.rawPayload).toEqual(encodedPayload);
  });

  it('parses encrypted transport client messages', () => {
    const parsed = parseRelayClientMessage(
      JSON.stringify({
        type: 'transport',
        message: {
          source: 'roomful',
          protocolVersion: 2,
          codec: 'json',
          roomId: 'room-encrypted',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          timestamp: 9,
          type: 'encrypted',
          payload: {
            version: 1,
            iv: [1, 2, 3],
            ciphertext: [4, 5, 6],
          },
        },
      }),
    );

    expectTransportMessage(parsed, {
      type: 'transport',
      encoding: 'json',
      signal: {
        type: 'encrypted',
        roomId: 'room-encrypted',
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
        timestamp: 9,
        payload: {
          version: 1,
          iv: new Uint8Array([1, 2, 3]),
          ciphertext: new Uint8Array([4, 5, 6]),
        },
      },
    });
  });

  it('preserves raw msgpack payloads for msgpack-capable recipients', () => {
    const encodedPayload = new Uint8Array(
      encode({
        type: 'transport',
        message: {
          source: 'roomful',
          protocolVersion: 2,
          codec: 'msgpack',
          roomId: 'room-msgpack',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          timestamp: 5,
          type: 'event',
          payload: {
            name: 'ping',
            payload: {
              ok: true,
            },
          },
        },
      }),
    );

    const parsed = parseRelayClientMessage(encodedPayload);
    expectTransportMessage(parsed, {
      type: 'transport',
      encoding: 'msgpack',
      signal: {
        type: 'event',
        roomId: 'room-msgpack',
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
        timestamp: 5,
        payload: {
          name: 'ping',
          payload: {
            ok: true,
          },
        },
      },
    });

    expect(
      serializeRelayTransportMessage(parsed, {
        transportSession: resolveRelayTransportSession(protocol),
      }),
    ).toEqual(encodedPayload);

    expect(
      serializeRelayTransportMessage(parsed, {
        transportSession: resolveRelayTransportSession(undefined),
      }),
    ).toBeTypeOf('string');
  });

  it('rejects invalid relay client payloads', () => {
    expect(parseRelayClientMessage('not-json')).toBeNull();
    expect(parseRelayClientMessage(null)).toBeNull();
    expect(parseRelayClientMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();

    expect(
      parseRelayClientMessage(
        JSON.stringify({
          type: 'signal',
          roomId: 'room-a',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
        }),
      ),
    ).toBeNull();

    expect(
      parseRelayClientMessage(
        JSON.stringify({
          type: 'join',
          roomId: 'room-a',
        }),
      ),
    ).toBeNull();

    expect(
      parseRelayClientMessage(
        JSON.stringify({
          type: 'transport',
          message: {
            source: 'roomful',
            protocolVersion: 2,
            codec: 'json',
            roomId: 'room-a',
            fromPeerId: 'peer-a',
            timestamp: 1,
            type: 'event',
            payload: {},
          },
        }),
      ),
    ).toBeNull();

    expect(
      parseRelayClientMessage(
        JSON.stringify({
          type: 'transport',
          message: {
            source: 'roomful',
            protocolVersion: 2,
            codec: 'json',
            roomId: 'room-a',
            fromPeerId: 'peer-a',
            timestamp: 1,
            type: 'unknown',
            payload: {},
          },
        }),
      ),
    ).toBeNull();
  });
});
