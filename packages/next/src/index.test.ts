import { RelayJwtVerificationError, verifyJWT } from '@roomful/relay';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRoomfulTokenRoute,
  fetchRoomfulToken,
  issueRoomfulToken,
  RoomfulTokenError,
} from './index.js';

const SECRET = 'relay-shared-secret';

describe('issueRoomfulToken', () => {
  it('mints a token the relay verifyJWT accepts (round-trip)', async () => {
    const token = await issueRoomfulToken({
      secret: SECRET,
      subject: 'peer-a',
      roomId: 'room-42',
    });

    const payload = verifyJWT(token, SECRET);

    expect(payload.sub).toBe('peer-a');
    expect(payload.roomId).toBe('room-42');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp).toBeGreaterThan(payload.iat as number);
  });

  it('produces a compact HS256 JWT with the expected header', async () => {
    const token = await issueRoomfulToken({ secret: SECRET });
    const segments = token.split('.');

    expect(segments).toHaveLength(3);

    const header = JSON.parse(Buffer.from(segments[0]!, 'base64url').toString('utf8'));
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('merges extra claims and honors issuedAt + notBeforeSeconds', async () => {
    // Anchor iat to "now" so the token is genuinely valid (not active in the past) when verified.
    const issuedAt = Math.floor(Date.now() / 1_000);
    const token = await issueRoomfulToken({
      secret: SECRET,
      issuedAt,
      expiresInSeconds: 120,
      notBeforeSeconds: 0,
      claims: { role: 'editor', org: 'acme' },
    });

    const payload = verifyJWT(token, SECRET);

    expect(payload.iat).toBe(issuedAt);
    expect(payload.exp).toBe(issuedAt + 120);
    expect(payload.nbf).toBe(issuedAt);
    expect(payload.role).toBe('editor');
    expect(payload.org).toBe('acme');
  });

  it('fails verification under a wrong secret', async () => {
    const token = await issueRoomfulToken({ secret: SECRET, subject: 'peer-a' });

    expect(() => verifyJWT(token, 'different-secret')).toThrow(RelayJwtVerificationError);
    expect(() => verifyJWT(token, 'different-secret')).toThrow(/Invalid JWT signature/);
  });

  it('produces an already-expired token the relay rejects', async () => {
    const token = await issueRoomfulToken({ secret: SECRET, expiresInSeconds: -10 });

    expect(() => verifyJWT(token, SECRET)).toThrow(/expired/i);
  });

  it('produces a not-yet-active token the relay rejects', async () => {
    const token = await issueRoomfulToken({
      secret: SECRET,
      notBeforeSeconds: 3_600,
    });

    expect(() => verifyJWT(token, SECRET)).toThrow(/not active/i);
  });

  it('rejects an empty secret', async () => {
    await expect(issueRoomfulToken({ secret: '' })).rejects.toBeInstanceOf(RoomfulTokenError);
  });
});

describe('createRoomfulTokenRoute', () => {
  it('issues a relay-valid token when authorize returns params', async () => {
    const handler = createRoomfulTokenRoute({
      secret: SECRET,
      authorize: async () => ({ subject: 'peer-b', roomId: 'room-7' }),
    });

    const response = await handler(new Request('https://app.test/api/roomful', { method: 'POST' }));
    expect(response.status).toBe(200);

    const body = await response.json();
    const payload = verifyJWT(body.token, SECRET);
    expect(payload.sub).toBe('peer-b');
    expect(payload.roomId).toBe('room-7');
  });

  it('returns the Response verbatim when authorize rejects', async () => {
    const handler = createRoomfulTokenRoute({
      secret: SECRET,
      authorize: async () => new Response(null, { status: 401 }),
    });

    const response = await handler(new Request('https://app.test/api/roomful', { method: 'POST' }));
    expect(response.status).toBe(401);
  });

  it('issues a token with no authorize hook', async () => {
    const handler = createRoomfulTokenRoute({ secret: SECRET });

    const response = await handler(new Request('https://app.test/api/roomful', { method: 'POST' }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(() => verifyJWT(body.token, SECRET)).not.toThrow();
  });

  it('throws synchronously on an empty secret', () => {
    expect(() => createRoomfulTokenRoute({ secret: '' })).toThrow(RoomfulTokenError);
  });
});

describe('fetchRoomfulToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the token from an ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ token: 'minted-token' }));

    await expect(fetchRoomfulToken('/api/roomful')).resolves.toBe('minted-token');
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));

    await expect(fetchRoomfulToken('/api/roomful')).rejects.toBeInstanceOf(RoomfulTokenError);
  });

  it('throws when the response omits a token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));

    await expect(fetchRoomfulToken('/api/roomful')).rejects.toThrow(/token/);
  });
});
