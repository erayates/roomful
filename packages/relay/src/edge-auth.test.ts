import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EdgeRelayJwtVerificationError, verifyRelayJwtEdge } from './edge-auth.js';

const SECRET = 'test-secret';

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(
  payload: Record<string, unknown>,
  options?: { secret?: string; alg?: string },
): string {
  const header = base64Url(JSON.stringify({ alg: options?.alg ?? 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', options?.secret ?? SECRET)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64Url(signature)}`;
}

const fixedNow = (): number => 1_000_000_000_000;

describe('verifyRelayJwtEdge', () => {
  it('resolves the claims of a valid token', async () => {
    const token = signJwt({ sub: 'peer-a', room: 'room-a' });

    const claims = await verifyRelayJwtEdge(token, SECRET, fixedNow);

    expect(claims).toMatchObject({ sub: 'peer-a', room: 'room-a' });
  });

  it('accepts an unexpired token against the injected clock', async () => {
    const nowSeconds = Math.floor(fixedNow() / 1_000);
    const token = signJwt({ exp: nowSeconds + 60, nbf: nowSeconds - 60 });

    await expect(verifyRelayJwtEdge(token, SECRET, fixedNow)).resolves.toMatchObject({});
  });

  it('rejects an expired token', async () => {
    const nowSeconds = Math.floor(fixedNow() / 1_000);
    const token = signJwt({ exp: nowSeconds - 1 });

    await expect(verifyRelayJwtEdge(token, SECRET, fixedNow)).rejects.toThrow(/expired/i);
  });

  it('rejects a not-yet-active token', async () => {
    const nowSeconds = Math.floor(fixedNow() / 1_000);
    const token = signJwt({ nbf: nowSeconds + 60 });

    await expect(verifyRelayJwtEdge(token, SECRET, fixedNow)).rejects.toThrow(/not active/i);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = signJwt({ sub: 'peer-a' }, { secret: 'other-secret' });

    await expect(verifyRelayJwtEdge(token, SECRET, fixedNow)).rejects.toThrow(/signature/i);
  });

  it('rejects a non-HS256 algorithm', async () => {
    const token = signJwt({ sub: 'peer-a' }, { alg: 'none' });

    await expect(verifyRelayJwtEdge(token, SECRET, fixedNow)).rejects.toThrow(/algorithm/i);
  });

  it('rejects a malformed token', async () => {
    await expect(verifyRelayJwtEdge('only.two', SECRET, fixedNow)).rejects.toBeInstanceOf(
      EdgeRelayJwtVerificationError,
    );
  });
});
