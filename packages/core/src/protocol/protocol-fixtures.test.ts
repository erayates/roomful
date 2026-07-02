import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createProtocolCapabilities,
  LEGACY_PROTOCOL_SESSION,
  negotiatePeerProtocolSession,
  normalizePeerWireMessage,
  parsePeerWireEnvelope,
  type PeerProtocolCapabilities,
  type PeerProtocolSession,
  type PeerWireMessage,
  serializePeerWireEnvelope,
} from './peer-message';

// RFC-0001 (#102): canonical, cross-SDK protocol fixtures. This test both GENERATES the
// committed reference vectors (`protocol-fixtures/core-vectors.json`, via a file snapshot) and
// VALIDATES the live core serializer/parser against them (byte-exact encode + round-trip decode +
// negotiation). Any SDK (the future `roomful` Dart client) implements the protocol by passing the
// same vectors. If core serialization drifts, the snapshot mismatch fails the test on review.

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../protocol-fixtures/core-vectors.json',
);

// Fixed clock so vectors are deterministic (the legacy v1 envelope drops `timestamp`, so parsing it
// back fills the clock — pinning it keeps round-trips exact).
const FIXED_TS = 1_700_000_000_000;
const fixedNow = (): number => FIXED_TS;

const MODERN_CAPS = createProtocolCapabilities(['json', 'msgpack'], 'msgpack');
const JSON_ONLY_CAPS = createProtocolCapabilities(['json'], 'json');

const LEGACY: PeerProtocolSession = LEGACY_PROTOCOL_SESSION;
const V2_JSON: PeerProtocolSession = { version: 2, codec: 'json', legacy: false };
const V2_MSGPACK: PeerProtocolSession = { version: 2, codec: 'msgpack', legacy: false };

interface NegotiationCase {
  name: string;
  local: PeerProtocolCapabilities;
  remote: PeerProtocolCapabilities | null;
  supportsBinary: boolean;
  expect: { compatible: true; session: PeerProtocolSession } | { compatible: false };
}

const NEGOTIATION_CASES: NegotiationCase[] = [
  {
    name: 'remote-advertises-no-capabilities',
    local: MODERN_CAPS,
    remote: null,
    supportsBinary: true,
    expect: { compatible: true, session: LEGACY },
  },
  {
    name: 'both-modern-binary-transport',
    local: MODERN_CAPS,
    remote: MODERN_CAPS,
    supportsBinary: true,
    expect: { compatible: true, session: V2_MSGPACK },
  },
  {
    name: 'both-modern-non-binary-transport',
    local: MODERN_CAPS,
    remote: MODERN_CAPS,
    supportsBinary: false,
    expect: { compatible: true, session: V2_JSON },
  },
  {
    name: 'remote-json-only',
    local: MODERN_CAPS,
    remote: JSON_ONLY_CAPS,
    supportsBinary: true,
    expect: { compatible: true, session: V2_JSON },
  },
  {
    name: 'both-json-only',
    local: JSON_ONLY_CAPS,
    remote: JSON_ONLY_CAPS,
    supportsBinary: true,
    expect: { compatible: true, session: V2_JSON },
  },
];

interface EnvelopeCase {
  name: string;
  session: PeerProtocolSession;
  message: PeerWireMessage;
}

function helloMessage(): PeerWireMessage {
  return {
    type: 'hello',
    roomId: 'room-a',
    fromPeerId: 'peer-a',
    timestamp: FIXED_TS,
    payload: {
      peer: { id: 'peer-a', joinedAt: 1, lastSeen: FIXED_TS, name: 'Alice', role: 'editor' },
      protocol: MODERN_CAPS,
    },
  };
}

const TEXT_MESSAGES: { name: string; message: PeerWireMessage }[] = [
  { name: 'hello', message: helloMessage() },
  {
    name: 'presence-update',
    message: {
      type: 'presence:update',
      roomId: 'room-a',
      fromPeerId: 'peer-a',
      timestamp: FIXED_TS,
      payload: { peer: { id: 'peer-a', joinedAt: 1, lastSeen: FIXED_TS, name: 'Alice' } },
    },
  },
  {
    name: 'cursor-update',
    message: {
      type: 'cursor:update',
      roomId: 'room-a',
      fromPeerId: 'peer-a',
      timestamp: FIXED_TS,
      payload: {
        cursor: {
          userId: 'peer-a',
          name: 'Alice',
          color: '#ff0055',
          x: 0.5,
          y: 0.25,
          xAbsolute: 640,
          yAbsolute: 360,
          idle: false,
        },
      },
    },
  },
  {
    name: 'event-direct',
    message: {
      type: 'event',
      roomId: 'room-a',
      fromPeerId: 'peer-a',
      toPeerId: 'peer-b',
      timestamp: FIXED_TS,
      payload: { name: 'ping', payload: { ok: true } },
    },
  },
  {
    name: 'state-update',
    message: {
      type: 'state:update',
      roomId: 'room-a',
      fromPeerId: 'peer-a',
      timestamp: FIXED_TS,
      payload: {
        value: { count: 1 },
        history: [],
        vectorClock: { 'peer-a': 1 },
        changedBy: 'peer-a',
        timestamp: FIXED_TS,
        reason: 'set',
      },
    },
  },
  {
    name: 'leave',
    message: {
      type: 'leave',
      roomId: 'room-a',
      fromPeerId: 'peer-a',
      timestamp: FIXED_TS,
      payload: {},
    },
  },
];

const BINARY_MESSAGES: { name: string; message: PeerWireMessage }[] = [
  {
    name: 'crdt-sync',
    message: {
      type: 'crdt:sync',
      roomId: 'room-a',
      fromPeerId: 'peer-a',
      timestamp: FIXED_TS,
      payload: { kind: 'update', data: new Uint8Array([10, 20, 30, 40]) },
    },
  },
  {
    name: 'encrypted',
    message: {
      type: 'encrypted',
      roomId: 'room-a',
      fromPeerId: 'peer-a',
      toPeerId: 'peer-b',
      timestamp: FIXED_TS,
      payload: {
        version: 1,
        iv: new Uint8Array([1, 2, 3]),
        ciphertext: new Uint8Array([4, 5, 6, 7, 8]),
      },
    },
  },
];

const ENVELOPE_CASES: EnvelopeCase[] = [
  ...TEXT_MESSAGES.flatMap(({ name, message }) => [
    { name: `${name}/v1-json`, session: LEGACY, message },
    { name: `${name}/v2-json`, session: V2_JSON, message },
    { name: `${name}/v2-msgpack`, session: V2_MSGPACK, message },
  ]),
  ...BINARY_MESSAGES.flatMap(({ name, message }) => [
    { name: `${name}/v2-json`, session: V2_JSON, message },
    { name: `${name}/v2-msgpack`, session: V2_MSGPACK, message },
  ]),
];

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function wireBytes(encoded: string | Uint8Array): Uint8Array {
  return typeof encoded === 'string' ? new TextEncoder().encode(encoded) : encoded;
}

// Uint8Array -> { $bin: <base64> } so the fixture file stays plain JSON. SDKs revive it to bytes.
function dehydrate(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { $bin: toBase64(value) };
  }
  if (Array.isArray(value)) {
    return value.map(dehydrate);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = dehydrate(inner);
    }
    return out;
  }
  return value;
}

describe('protocol fixtures (RFC-0001 #102)', () => {
  it('generates and matches the committed cross-SDK vectors', async () => {
    const fixtures = {
      version: 1,
      description:
        'Canonical Roomful Protocol v2 vectors (RFC-0001). Binary fields are { "$bin": base64 }. ' +
        'wireBase64 is base64 of the on-the-wire bytes (UTF-8 JSON, or MessagePack).',
      sessions: { legacy: LEGACY, v2json: V2_JSON, v2msgpack: V2_MSGPACK },
      negotiation: NEGOTIATION_CASES.map((c) => ({
        name: c.name,
        local: c.local,
        remote: c.remote,
        supportsBinary: c.supportsBinary,
        result: negotiatePeerProtocolSession(c.local, c.remote ?? undefined, {
          supportsBinary: c.supportsBinary,
        }),
      })),
      envelopes: ENVELOPE_CASES.map((c) => {
        const encoded = serializePeerWireEnvelope(c.message, c.session);
        if (encoded === null) {
          throw new Error(`Failed to serialize fixture "${c.name}".`);
        }
        return {
          name: c.name,
          session: c.session,
          message: dehydrate(c.message),
          wireBase64: toBase64(wireBytes(encoded)),
          ...(typeof encoded === 'string' ? { text: encoded } : {}),
        };
      }),
    };

    await expect(`${JSON.stringify(fixtures, null, 2)}\n`).toMatchFileSnapshot(FIXTURE_PATH);
  });

  it('round-trips every envelope vector (encode then decode)', () => {
    for (const c of ENVELOPE_CASES) {
      const encoded = serializePeerWireEnvelope(c.message, c.session);
      const parsed = parsePeerWireEnvelope(encoded, { now: fixedNow });
      expect(parsed, c.name).toEqual(normalizePeerWireMessage(c.message, fixedNow));
    }
  });

  it('matches every negotiation vector', () => {
    for (const c of NEGOTIATION_CASES) {
      const result = negotiatePeerProtocolSession(c.local, c.remote ?? undefined, {
        supportsBinary: c.supportsBinary,
      });
      if (c.expect.compatible) {
        expect(result.compatible, c.name).toBe(true);
        expect(result.compatible ? result.session : null, c.name).toEqual(c.expect.session);
      } else {
        expect(result.compatible, c.name).toBe(false);
      }
    }
  });
});
