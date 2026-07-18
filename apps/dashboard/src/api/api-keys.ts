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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base62Encode(bytes: Uint8Array): string {
  let value = BigInt('0x' + bytesToHex(bytes));
  if (value === 0n) return BASE62.charAt(0);
  let result = '';
  while (value > 0n) {
    result = BASE62.charAt(Number(value % 62n)) + result;
    value = value / 62n;
  }
  return result;
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
}

function generateId(): string {
  return bytesToHex(randomBytes(8));
}

const keys: ApiKeyRecord[] = [];

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  return keys.filter((k) => k.revokedAt === null);
}

export async function createApiKey(name: string): Promise<CreatedApiKey> {
  const secret = `roomful_live_${base62Encode(randomBytes(KEY_SECRET_LENGTH))}`;
  const keyHash = await sha256Hex(secret);
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
