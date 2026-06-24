import { describe, expect, it } from 'vitest';

import { decodeMessagePack, encodeMessagePack, normalizeProtocolValue } from './messagepack';

function roundTrip(value: unknown): unknown {
  const encoded = encodeMessagePack(value);
  if (!encoded.ok) {
    throw new Error(`Expected encode to succeed: ${encoded.error}`);
  }

  const decoded = decodeMessagePack(encoded.value);
  if (!decoded.ok) {
    throw new Error(`Expected decode to succeed: ${decoded.error}`);
  }

  return decoded.value;
}

describe('messagepack', () => {
  it('roundtrips supported scalar, object, array, and binary values', () => {
    const fixture = {
      ok: true,
      count: 42,
      ratio: 1.5,
      label: 'hello',
      data: new Uint8Array([1, 2, 3]),
      nested: {
        list: [null, false, 'x'],
      },
    };

    const encoded = encodeMessagePack(fixture);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      throw new Error(encoded.error);
    }

    const decoded = decodeMessagePack(encoded.value);
    expect(decoded).toEqual({
      ok: true,
      value: {
        ok: true,
        count: 42,
        ratio: 1.5,
        label: 'hello',
        data: new Uint8Array([1, 2, 3]),
        nested: {
          list: [null, false, 'x'],
        },
      },
    });
  });

  it('normalizes undefined object keys and array items consistently', () => {
    const normalized = normalizeProtocolValue({
      a: 1,
      b: undefined,
      list: [1, undefined, 3],
    });

    expect(normalized).toEqual({
      ok: true,
      value: {
        a: 1,
        list: [1, null, 3],
      },
    });
  });

  it('produces smaller payloads than JSON for representative fixtures', () => {
    const helloFixture = {
      source: 'roomful',
      protocolVersion: 2,
      codec: 'msgpack',
      roomId: 'room-size',
      fromPeerId: 'peer-a',
      timestamp: 1,
      type: 'hello',
      payload: {
        peer: {
          id: 'peer-a',
          joinedAt: 1,
          lastSeen: 1,
          name: 'Alice',
          color: '#111111',
        },
        protocol: {
          minVersion: 1,
          maxVersion: 2,
          codecs: ['json', 'msgpack'],
          preferredCodec: 'msgpack',
        },
      },
    };

    const encoded = encodeMessagePack(helloFixture);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      throw new Error(encoded.error);
    }

    const jsonBytes = new TextEncoder().encode(JSON.stringify(helloFixture)).byteLength;
    expect(encoded.value.byteLength).toBeLessThan(jsonBytes);
  });

  it('fails cleanly for unsupported values', () => {
    expect(encodeMessagePack({ value: new Map() }).ok).toBe(false);
    expect(encodeMessagePack({ value: 1n }).ok).toBe(false);
    expect(encodeMessagePack({ value: class Example {} }).ok).toBe(false);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(encodeMessagePack(circular).ok).toBe(false);
  });

  it('rejects malformed binary input without throwing', () => {
    expect(decodeMessagePack(new Uint8Array([0xc1]))).toEqual({
      ok: false,
      error: 'Unsupported MessagePack prefix 0xc1.',
    });

    expect(decodeMessagePack(new Uint8Array([0xd9]))).toEqual({
      ok: false,
      error: 'Invalid MessagePack str8 payload.',
    });
  });
});

describe('messagepack integer boundaries', () => {
  it('round-trips every integer size class and the float fallback', () => {
    const cases = [
      0, 127, 128, 255, 256, 65535, 65536, 4294967295, 4294967296, -1, -32, -33, -128, -129, -32768,
      -32769, -2147483648, -2147483649, 1.5, -0.5, 3.141592653589793,
    ];

    for (const value of cases) {
      expect(roundTrip(value)).toBe(value);
    }
  });
});

describe('messagepack size classes', () => {
  it('round-trips strings across fixstr, str8, str16, and str32 headers', () => {
    for (const length of [0, 5, 31, 32, 255, 256, 65535, 65536]) {
      const value = 'a'.repeat(length);
      expect(roundTrip(value)).toBe(value);
    }
  });

  it('round-trips binary across bin8, bin16, and bin32 headers', () => {
    for (const length of [0, 255, 256, 65536]) {
      const value = new Uint8Array(length).fill(7);
      expect(roundTrip(value)).toEqual(value);
    }
  });

  it('round-trips arrays across fixarray, array16, and array32 headers', () => {
    for (const length of [0, 15, 16, 65536]) {
      const value = Array.from({ length }, () => 1);
      expect(roundTrip(value)).toEqual(value);
    }
  });

  it('round-trips maps across fixmap, map16, and map32 headers', () => {
    for (const size of [0, 16, 65536]) {
      const value: Record<string, number> = {};
      for (let index = 0; index < size; index += 1) {
        value[`k${String(index)}`] = index;
      }

      expect(roundTrip(value)).toEqual(value);
    }
  });
});

describe('messagepack decode-only paths', () => {
  it('decodes uint64 and int64 payloads the encoder never emits', () => {
    expect(decodeMessagePack(new Uint8Array([0xcf, 0, 0, 0, 2, 0, 0, 0, 0]))).toEqual({
      ok: true,
      value: 8589934592,
    });

    expect(
      decodeMessagePack(new Uint8Array([0xd3, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])),
    ).toEqual({ ok: true, value: -1 });

    expect(decodeMessagePack(new Uint8Array([0xd3, 0, 0, 0, 2, 0, 0, 0, 0]))).toEqual({
      ok: true,
      value: 8589934592,
    });
  });

  it('rejects 64-bit integers beyond the safe range', () => {
    expect(decodeMessagePack(new Uint8Array([0xcf, 0, 0x20, 0, 0, 0, 0, 0, 0])).ok).toBe(false);
    expect(decodeMessagePack(new Uint8Array([0xd3, 0, 0x20, 0, 0, 0, 0, 0, 0])).ok).toBe(false);
  });

  it('rejects the intentionally unsupported float32 type', () => {
    expect(decodeMessagePack(new Uint8Array([0xca, 0, 0, 0, 0]))).toEqual({
      ok: false,
      error: 'MessagePack float32 values are not supported.',
    });
  });

  it('accepts an ArrayBuffer payload', () => {
    const encoded = encodeMessagePack({ ping: 1 });
    if (!encoded.ok) {
      throw new Error(encoded.error);
    }

    expect(decodeMessagePack(encoded.value.buffer)).toEqual({ ok: true, value: { ping: 1 } });
  });
});

describe('messagepack failure paths', () => {
  it('rejects non-finite numbers and unsupported top-level values', () => {
    expect(encodeMessagePack(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(encodeMessagePack(Number.NaN).ok).toBe(false);
    expect(encodeMessagePack(undefined).ok).toBe(false);
    expect(encodeMessagePack(() => 0).ok).toBe(false);
    expect(encodeMessagePack(Symbol('unsupported')).ok).toBe(false);
  });

  it('rejects circular arrays', () => {
    const circular: unknown[] = [];
    circular.push(circular);

    expect(encodeMessagePack(circular).ok).toBe(false);
  });

  it('reports an empty payload', () => {
    expect(decodeMessagePack(new Uint8Array([]))).toEqual({
      ok: false,
      error: 'Unexpected end of MessagePack payload.',
    });
  });

  it('rejects truncated multi-byte scalars', () => {
    for (const prefix of [0xcc, 0xcd, 0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xcb]) {
      expect(decodeMessagePack(new Uint8Array([prefix])).ok).toBe(false);
    }
  });

  it('rejects truncated string, binary, array, and map headers', () => {
    for (const prefix of [0xd9, 0xda, 0xdb, 0xc4, 0xc5, 0xc6, 0xdc, 0xdd, 0xde, 0xdf]) {
      expect(decodeMessagePack(new Uint8Array([prefix])).ok).toBe(false);
    }
  });

  it('rejects headers that promise more bytes than provided', () => {
    expect(decodeMessagePack(new Uint8Array([0xd9, 5])).ok).toBe(false);
    expect(decodeMessagePack(new Uint8Array([0xc4, 3])).ok).toBe(false);
    expect(decodeMessagePack(new Uint8Array([0x91])).ok).toBe(false);
    expect(decodeMessagePack(new Uint8Array([0x81])).ok).toBe(false);
  });

  it('rejects maps with non-string keys', () => {
    expect(decodeMessagePack(new Uint8Array([0x81, 0x00, 0x00]))).toEqual({
      ok: false,
      error: 'MessagePack maps must use string keys.',
    });
  });

  it('rejects trailing bytes after a complete value', () => {
    expect(decodeMessagePack(new Uint8Array([0xc0, 0xc0]))).toEqual({
      ok: false,
      error: 'Unexpected trailing MessagePack bytes.',
    });
  });
});
