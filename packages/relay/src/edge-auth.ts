import { isObject } from './internal/guards.js';

// Edge-runtime twin of `./auth`: the same HS256 relay JWT verification, but built on the
// Web Crypto `crypto.subtle` HMAC API (and `atob`) instead of `node:crypto`, so it runs on
// Cloudflare Workers / Deno as well as Node.

/**
 * The decoded relay JWT claims. `exp`/`nbf` are validated as finite seconds when present.
 */
export type RelayJwtClaims = Record<string, unknown>;

/**
 * Thrown when edge relay JWT verification fails.
 */
export class EdgeRelayJwtVerificationError extends TypeError {
  public constructor(message: string) {
    super(message);
    this.name = 'EdgeRelayJwtVerificationError';
  }
}

function base64UrlToBytes(segment: string, part: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new EdgeRelayJwtVerificationError(`JWT ${part} is not valid base64url.`);
  }

  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new EdgeRelayJwtVerificationError(`JWT ${part} is not valid base64url.`);
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeJsonSegment(segment: string, part: string): Record<string, unknown> {
  const text = new TextDecoder().decode(base64UrlToBytes(segment, part));

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new EdgeRelayJwtVerificationError(`JWT ${part} must decode to a JSON object.`);
  }

  if (!isObject(parsed)) {
    throw new EdgeRelayJwtVerificationError(`JWT ${part} must decode to a JSON object.`);
  }

  return parsed;
}

function readNumericClaim(value: unknown, name: 'exp' | 'nbf'): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EdgeRelayJwtVerificationError(`JWT ${name} claim must be a finite number.`);
  }

  return value;
}

/**
 * Verifies an HS256 relay JWT using Web Crypto.
 *
 * @param token - The compact JWT string.
 * @param secret - The shared HS256 secret.
 * @param now - Injectable clock (ms) for testing; defaults to `Date.now`.
 * @returns The decoded claims.
 * @throws {EdgeRelayJwtVerificationError} When the token is malformed, expired, or invalid.
 */
export async function verifyRelayJwtEdge(
  token: string,
  secret: string,
  now: () => number = () => Date.now(),
): Promise<RelayJwtClaims> {
  if (typeof token !== 'string' || token.length === 0) {
    throw new EdgeRelayJwtVerificationError('JWT token must be a non-empty string.');
  }

  if (typeof secret !== 'string' || secret.length === 0) {
    throw new EdgeRelayJwtVerificationError('JWT secret must be a non-empty string.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new EdgeRelayJwtVerificationError('JWT must use compact serialization.');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new EdgeRelayJwtVerificationError('JWT must include header, payload, and signature.');
  }

  const header = decodeJsonSegment(encodedHeader, 'header');
  if (header.alg !== 'HS256') {
    throw new EdgeRelayJwtVerificationError('Unsupported JWT algorithm.');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(encodedSignature, 'signature'),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) {
    throw new EdgeRelayJwtVerificationError('Invalid JWT signature.');
  }

  const payload = decodeJsonSegment(encodedPayload, 'payload');
  const exp = readNumericClaim(payload.exp, 'exp');
  const nbf = readNumericClaim(payload.nbf, 'nbf');
  const nowSeconds = Math.floor(now() / 1_000);

  if (exp !== undefined && nowSeconds >= exp) {
    throw new EdgeRelayJwtVerificationError('JWT has expired.');
  }

  if (nbf !== undefined && nowSeconds < nbf) {
    throw new EdgeRelayJwtVerificationError('JWT is not active yet.');
  }

  return payload;
}
