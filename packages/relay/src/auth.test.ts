import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { RelayJwtVerificationError, verifyJWT } from './auth.js';

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function createJwt(
  payload: Record<string, unknown>,
  secret: string,
  header: Record<string, unknown> = {
    alg: 'HS256',
    typ: 'JWT',
  },
): string {
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const encodedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

describe('verifyJWT', () => {
  it('verifies valid HS256 tokens', () => {
    const payload = {
      sub: 'peer-a',
      roomId: 'room-auth',
      exp: Math.floor(Date.now() / 1_000) + 60,
    };
    const token = createJwt(payload, 'secret-key');

    expect(verifyJWT(token, 'secret-key')).toEqual(payload);
  });

  it('rejects malformed compact tokens', () => {
    expect(() => verifyJWT('not-a-jwt', 'secret-key')).toThrow(RelayJwtVerificationError);
  });

  it('rejects unsupported algorithms', () => {
    const token = createJwt(
      {
        sub: 'peer-a',
      },
      'secret-key',
      {
        alg: 'HS512',
        typ: 'JWT',
      },
    );

    expect(() => verifyJWT(token, 'secret-key')).toThrow(/Unsupported JWT algorithm/);
  });

  it('rejects invalid signatures', () => {
    const token = createJwt(
      {
        sub: 'peer-a',
      },
      'wrong-secret',
    );

    expect(() => verifyJWT(token, 'secret-key')).toThrow(/Invalid JWT signature/);
  });

  it('rejects expired tokens', () => {
    const token = createJwt(
      {
        sub: 'peer-a',
        exp: Math.floor(Date.now() / 1_000) - 1,
      },
      'secret-key',
    );

    expect(() => verifyJWT(token, 'secret-key')).toThrow(/JWT has expired/);
  });

  it('rejects tokens before their not-before time', () => {
    const token = createJwt(
      {
        sub: 'peer-a',
        nbf: Math.floor(Date.now() / 1_000) + 60,
      },
      'secret-key',
    );

    expect(() => verifyJWT(token, 'secret-key')).toThrow(/JWT is not active yet/);
  });

  it('rejects non-numeric issued-at claims', () => {
    const token = createJwt(
      {
        sub: 'peer-a',
        iat: 'today',
      },
      'secret-key',
    );

    expect(() => verifyJWT(token, 'secret-key')).toThrow(/JWT iat claim must be a finite number/);
  });
});
