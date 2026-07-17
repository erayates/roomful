import { describe, expect, test } from 'vitest';

import { InMemoryApiKeyStore } from './api-keys.js';
import type { CreateApiKeyInput } from './models.js';

describe('InMemoryApiKeyStore', () => {
  test('creates and retrieves a key', async () => {
    const store = new InMemoryApiKeyStore();
    const input: CreateApiKeyInput = { name: 'test-key' };
    const created = await store.createKey('proj-1', input);

    expect(created.secret).toMatch(/^roomful_live_/);
    expect(created.key.name).toBe('test-key');
    expect(created.key.projectId).toBe('proj-1');

    const retrieved = await store.getKey(created.key.id);
    expect(retrieved?.name).toBe('test-key');
  });

  test('validates a valid key', async () => {
    const store = new InMemoryApiKeyStore();
    const { secret } = await store.createKey('proj-1', { name: 'k' });

    const result = await store.validateKey(secret);
    expect(result?.projectId).toBe('proj-1');
  });

  test('rejects invalid key', async () => {
    const store = new InMemoryApiKeyStore();
    const result = await store.validateKey('invalid');
    expect(result).toBeNull();
  });

  test('revokes a key', async () => {
    const store = new InMemoryApiKeyStore();
    const { key, secret } = await store.createKey('proj-1', { name: 'k' });

    await store.revokeKey(key.id);
    const result = await store.validateKey(secret);
    expect(result).toBeNull();
  });

  test('lists keys for a project', async () => {
    const store = new InMemoryApiKeyStore();
    await store.createKey('proj-1', { name: 'a' });
    await store.createKey('proj-1', { name: 'b' });
    await store.createKey('proj-2', { name: 'c' });

    const keys = await store.listKeys('proj-1');
    expect(keys).toHaveLength(2);
  });
});
