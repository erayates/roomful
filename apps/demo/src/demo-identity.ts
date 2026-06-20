import type { DemoIdentity } from './demo-types';

export const DEMO_IDENTITY_STORAGE_KEY = 'roomful-demo-identity';

const ADJECTIVES = ['Bright', 'Neon', 'Signal', 'Solar', 'Velvet', 'Wild', 'Electric', 'Quartz'];
const NOUNS = ['Canary', 'Comet', 'Fox', 'Harbor', 'Nova', 'Otter', 'Pulse', 'Raven'];
const DEFAULT_IDENTITY_COLOR = '#ff6b35';
const PALETTE = [
  DEFAULT_IDENTITY_COLOR,
  '#1ea896',
  '#005f73',
  '#5f0f40',
  '#3a86ff',
  '#8a5cf6',
  '#ef476f',
  '#ff9f1c',
];

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function pick<T>(values: readonly T[], rng: () => number): T {
  const candidate = values[Math.floor(rng() * values.length)];
  if (candidate === undefined) {
    throw new RangeError('Cannot create a demo identity from an empty palette.');
  }

  return candidate;
}

function isStoredIdentity(value: unknown): value is DemoIdentity {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'name' in value &&
    typeof value.name === 'string' &&
    'color' in value &&
    typeof value.color === 'string'
  );
}

export function sanitizeDisplayName(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized === '') {
    return 'Guest';
  }

  return normalized.slice(0, 24);
}

export function createDemoIdentity(rng: () => number = Math.random): DemoIdentity {
  const adjective = pick(ADJECTIVES, rng);
  const noun = pick(NOUNS, rng);
  const suffix = String(Math.floor(rng() * 90) + 10);
  const color = pick(PALETTE, rng);

  return {
    color,
    name: `${adjective} ${noun} ${suffix}`,
  };
}

export function readStoredIdentity(storage: StorageLike): DemoIdentity | null {
  const raw = storage.getItem(DEMO_IDENTITY_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredIdentity(parsed)) {
      return null;
    }

    const name = sanitizeDisplayName(parsed.name);
    const color = parsed.color.trim();
    if (color === '') {
      return null;
    }

    return { color, name };
  } catch {
    return null;
  }
}

export function updateIdentityName(identity: DemoIdentity, name: string): DemoIdentity {
  return {
    ...identity,
    name: sanitizeDisplayName(name),
  };
}

export function writeStoredIdentity(storage: StorageLike, identity: DemoIdentity): DemoIdentity {
  const sanitized = {
    color: identity.color.trim() || DEFAULT_IDENTITY_COLOR,
    name: sanitizeDisplayName(identity.name),
  };

  storage.setItem(DEMO_IDENTITY_STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
}
