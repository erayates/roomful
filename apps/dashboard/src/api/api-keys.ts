import { createHash, randomBytes } from 'node:crypto';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  createdAt: number;
  revokedAt: number | null;
}

export interface CreatedApiKey {
  key: ApiKeyRecord;
  secret: string;
}

const KEY_SECRET_LENGTH = 32;
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

function generateId(): string {
  return randomBytes(8).toString('hex');
}

const keys: ApiKeyRecord[] = [];

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  return keys.filter((k) => k.revokedAt === null);
}

export async function createApiKey(name: string): Promise<CreatedApiKey> {
  const secret = `roomful_live_${base62Encode(randomBytes(KEY_SECRET_LENGTH))}`;
  const keyHash = createHash('sha256').update(secret).digest('hex');
  const id = generateId();

  const record: ApiKeyRecord = {
    id,
    name,
    keyPrefix: secret.slice(0, 16),
    keyHash,
    scopes: ['rooms:read', 'rooms:write'],
    createdAt: Date.now(),
    revokedAt: null,
  };

  keys.push(record);
  return { key: record, secret };
}

export async function revokeApiKey(id: string): Promise<void> {
  const key = keys.find((k) => k.id === id);
  if (key) {
    key.revokedAt = Date.now();
  }
}
