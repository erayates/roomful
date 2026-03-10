import { createHmac, timingSafeEqual } from 'node:crypto';

export interface RelayJwtPayload extends Record<string, unknown> {
  exp?: number;
  nbf?: number;
  iat?: number;
}

export class RelayJwtVerificationError extends TypeError {
  public constructor(message: string) {
    super(message);
    this.name = 'RelayJwtVerificationError';
  }
}

function createRelayJwtVerificationError(message: string): RelayJwtVerificationError {
  return new RelayJwtVerificationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeBase64UrlToBuffer(segment: string, part: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw createRelayJwtVerificationError(`JWT ${part} is not valid base64url.`);
  }

  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;

  try {
    return Buffer.from(`${normalized}${'='.repeat(paddingLength)}`, 'base64');
  } catch {
    throw createRelayJwtVerificationError(`JWT ${part} is not valid base64url.`);
  }
}

function decodeBase64UrlJson(segment: string, part: string): Record<string, unknown> {
  const decoded = decodeBase64UrlToBuffer(segment, part);
  let parsed: unknown;

  try {
    parsed = JSON.parse(decoded.toString('utf8'));
  } catch {
    throw createRelayJwtVerificationError(`JWT ${part} must decode to a JSON object.`);
  }

  if (!isRecord(parsed)) {
    throw createRelayJwtVerificationError(`JWT ${part} must decode to a JSON object.`);
  }

  return parsed;
}

function toRelayJwtPayload(value: Record<string, unknown>): RelayJwtPayload {
  return {
    ...value,
  };
}

function readNumericClaim(
  payload: RelayJwtPayload,
  name: 'exp' | 'nbf' | 'iat',
): number | undefined {
  const value = payload[name];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw createRelayJwtVerificationError(`JWT ${name} claim must be a finite number.`);
  }

  return value;
}

export function verifyJWT(token: string, secret: string): RelayJwtPayload {
  if (typeof token !== 'string' || token.length === 0) {
    throw createRelayJwtVerificationError('JWT token must be a non-empty string.');
  }

  if (typeof secret !== 'string' || secret.length === 0) {
    throw createRelayJwtVerificationError('JWT secret must be a non-empty string.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw createRelayJwtVerificationError('JWT must use compact serialization.');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw createRelayJwtVerificationError('JWT must include header, payload, and signature.');
  }

  const header = decodeBase64UrlJson(encodedHeader, 'header');
  if (header.alg !== 'HS256') {
    throw createRelayJwtVerificationError('Unsupported JWT algorithm.');
  }

  const payload = toRelayJwtPayload(decodeBase64UrlJson(encodedPayload, 'payload'));
  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = decodeBase64UrlToBuffer(encodedSignature, 'signature');

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw createRelayJwtVerificationError('Invalid JWT signature.');
  }

  const exp = readNumericClaim(payload, 'exp');
  const nbf = readNumericClaim(payload, 'nbf');
  readNumericClaim(payload, 'iat');

  const now = Math.floor(Date.now() / 1_000);
  if (exp !== undefined && now >= exp) {
    throw createRelayJwtVerificationError('JWT has expired.');
  }

  if (nbf !== undefined && now < nbf) {
    throw createRelayJwtVerificationError('JWT is not active yet.');
  }

  return payload;
}
