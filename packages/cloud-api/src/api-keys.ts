import { createHash, randomBytes } from 'node:crypto';

import type { ApiKey, ApiKeyCreated, ApiKeyScope, CreateApiKeyInput } from './models.js';

const KEY_PREFIX_LENGTH = 8;
const KEY_SECRET_LENGTH = 48;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function base62Encode(bytes: Buffer): string {
  let value = BigInt('0x' + bytes.toString('hex'));
  if (value === 0n) return BASE62.charAt(0);
  let result = '';
  while (value > 0n) {
    result = BASE62.charAt(Number(value % 62n)) + result;
    value = value / 62n;
  }
  return result;
}

function generateSecret(env: 'live' | 'test' = 'live'): string {
  const bytes = randomBytes(KEY_SECRET_LENGTH);
  return `roomful_${env}_${base62Encode(bytes)}`;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function extractKeyPrefix(secret: string): string {
  const parts = secret.split('_');
  // roomful_live_<base62>
  const payload = parts[2] ?? secret;
  return payload.slice(0, KEY_PREFIX_LENGTH);
}

export interface ApiKeyStore {
  createKey(projectId: string, input: CreateApiKeyInput): Promise<ApiKeyCreated>;
  getKey(keyId: string): Promise<ApiKey | null>;
  listKeys(projectId: string): Promise<ApiKey[]>;
  revokeKey(keyId: string): Promise<ApiKey | null>;
  validateKey(secret: string): Promise<{ projectId: string; scopes: ApiKeyScope[] } | null>;
}

export class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly keys = new Map<string, ApiKey>();
  private readonly hashToId = new Map<string, string>();

  async createKey(projectId: string, input: CreateApiKeyInput): Promise<ApiKeyCreated> {
    const secret = generateSecret();
    const keyHash = hashSecret(secret);
    const keyPrefix = extractKeyPrefix(secret);

    const key: ApiKey = {
      id: randomBytes(16).toString('hex'),
      projectId,
      name: input.name,
      keyPrefix,
      keyHash,
      scopes: input.scopes ?? ['rooms:read', 'rooms:write'],
      expiresAt: input.expiresAt ?? null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };

    this.keys.set(key.id, key);
    this.hashToId.set(keyHash, key.id);

    return { key, secret };
  }

  async getKey(keyId: string): Promise<ApiKey | null> {
    return this.keys.get(keyId) ?? null;
  }

  async listKeys(projectId: string): Promise<ApiKey[]> {
    return [...this.keys.values()].filter((k) => k.projectId === projectId && !k.revokedAt);
  }

  async revokeKey(keyId: string): Promise<ApiKey | null> {
    const key = this.keys.get(keyId);
    if (!key) return null;
    const revoked: ApiKey = { ...key, revokedAt: new Date().toISOString() };
    this.keys.set(keyId, revoked);
    return revoked;
  }

  async validateKey(secret: string): Promise<{ projectId: string; scopes: ApiKeyScope[] } | null> {
    const keyHash = hashSecret(secret);
    const keyId = this.hashToId.get(keyHash);
    if (!keyId) return null;

    const key = this.keys.get(keyId);
    if (!key || key.revokedAt) return null;
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) return null;

    // Update last used
    key.lastUsedAt = new Date().toISOString();

    return { projectId: key.projectId, scopes: key.scopes };
  }
}

export { generateSecret, hashSecret, extractKeyPrefix };
