import {
  createDemoIdentity,
  DEMO_IDENTITY_STORAGE_KEY,
  readStoredIdentity,
  sanitizeDisplayName,
  updateIdentityName,
} from './demo-identity';

describe('demo-identity', () => {
  it('creates a deterministic identity with a supplied rng', () => {
    expect(createDemoIdentity(() => 0)).toEqual({
      color: '#ff6b35',
      name: 'Bright Canary 10',
    });
  });

  it('sanitizes display names', () => {
    expect(sanitizeDisplayName('  Nora   Signal   ')).toBe('Nora Signal');
    expect(sanitizeDisplayName('   ')).toBe('Guest');
  });

  it('reads a valid stored identity', () => {
    const storage = {
      getItem(key: string) {
        return key === DEMO_IDENTITY_STORAGE_KEY
          ? JSON.stringify({ color: '#123456', name: '  Ada   Orbit  ' })
          : null;
      },
      setItem() {
        return undefined;
      },
    };

    expect(readStoredIdentity(storage)).toEqual({
      color: '#123456',
      name: 'Ada Orbit',
    });
  });

  it('updates the name without changing the color', () => {
    expect(
      updateIdentityName({ color: '#ff6b35', name: 'Bright Canary 10' }, '  Nora Signal '),
    ).toEqual({
      color: '#ff6b35',
      name: 'Nora Signal',
    });
  });
});
