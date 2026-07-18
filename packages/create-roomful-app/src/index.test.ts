import { describe, it, expect } from 'vitest';

describe('create-roomful-app', () => {
  it('should have a proper package.json', async () => {
    // Read the package.json to verify the package is well-formed.
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg).toBeDefined();
    expect(pkg.default.name).toBe('create-roomful-app');
    expect(pkg.default.bin).toHaveProperty('create-roomful-app');
  });
});
